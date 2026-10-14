import type { SupabaseClient } from '@supabase/supabase-js';
import { expectedPayment, payerOf, type PaymentRule } from '@/lib/collections';

// Weekly collections summary (Amit, 2026-10-14: "סיכום שבועי אלי וגם אל חני
// מנהלת החשבונות"). One computation for the Sunday push (cron round 10) and
// the "📊 סיכום שבועי" tab in /collections. Server-only: takes a service
// client the caller has already authorised.

const STUCK_DAYS = 14;

type Row = {
  id: string; assigned_to: string; plate: string; customer_name: string | null; insurer: string | null; work_source: string; claim_type: string | null;
  claim_check_due_date: string | null; payment_approved_on: string | null; case_closed_on: string | null; claim_stage: string | null;
  amount_due: number | null; vat_offset: number | null; reinstatement: number | null; offset_amount: number | null;
  received_amount: number | null; received_on: string | null; status: string; closed_at: string | null; opened_at: string;
};

export type WeeklyCase = { id: string; plate: string; customer_name: string | null; payer: string; amount: number; collector: string; detail: string };
export type CollectorWeek = {
  id: string; name: string;
  open: number; openAmount: number;
  receivedCount: number; receivedAmount: number;
  opened: number; overdue: number; stuck: number; checksPast: number; lateReminders: number;
};
export type WeeklySummary = { from: string; to: string; rows: CollectorWeek[]; total: CollectorWeek; stuck: WeeklyCase[]; overdue: WeeklyCase[]; checksPast: WeeklyCase[] };

const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const toCollect = (c: Row) => n(c.amount_due) - n(c.vat_offset) - n(c.reinstatement) - n(c.offset_amount);
const ilDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function loadWeeklySummary(db: SupabaseClient): Promise<WeeklySummary> {
  const now = new Date();
  const to = ilDate(now);
  const from = ilDate(new Date(now.getTime() - 7 * 86_400_000));
  const stuckSince = new Date(now.getTime() - STUCK_DAYS * 86_400_000).toISOString();

  const [casesRes, termsRes, people, recent, lateRem] = await Promise.all([
    db.from('collection_cases').select('id, assigned_to, plate, customer_name, insurer, work_source, claim_type, claim_check_due_date, payment_approved_on, case_closed_on, claim_stage, amount_due, vat_offset, reinstatement, offset_amount, received_amount, received_on, status, closed_at, opened_at').limit(10000),
    db.from('insurer_payment_terms').select('insurer, agreement, mode, offset_months, pay_day, cutoff_day, notes, basis'),
    db.from('profiles').select('id, full_name, role, is_active'),
    // Activity = anything written in the case log (not the automatic reminders' push).
    db.from('collection_case_events').select('case_id').gte('created_at', stuckSince).limit(20000),
    db.from('collection_case_events').select('remind_user').is('remind_done_at', null).lt('remind_at', new Date(now.getTime() - 86_400_000).toISOString()).limit(5000),
  ]);
  const cases = (casesRes.data ?? []) as Row[];
  const terms: Record<string, PaymentRule> = Object.fromEntries(((termsRes.data ?? []) as PaymentRule[]).map((t) => [t.insurer, t]));
  const ppl = (people.data ?? []) as { id: string; full_name: string | null; role: string; is_active: boolean }[];
  const nameById = new Map(ppl.map((p) => [p.id, p.full_name ?? '—']));
  const active = new Set(((recent.data ?? []) as { case_id: string }[]).map((e) => e.case_id));
  const lateBy = new Map<string, number>();
  for (const r of (lateRem.data ?? []) as { remind_user: string | null }[]) if (r.remind_user) lateBy.set(r.remind_user, (lateBy.get(r.remind_user) ?? 0) + 1);

  const blank = (id: string, name: string): CollectorWeek => ({ id, name, open: 0, openAmount: 0, receivedCount: 0, receivedAmount: 0, opened: 0, overdue: 0, stuck: 0, checksPast: 0, lateReminders: 0 });
  const by = new Map<string, CollectorWeek>();
  for (const p of ppl) if (p.role === 'COLLECTIONS' && p.is_active) by.set(p.id, blank(p.id, p.full_name ?? '—'));
  const stuck: WeeklyCase[] = [];
  const overdue: WeeklyCase[] = [];
  const checksPast: WeeklyCase[] = [];

  for (const c of cases) {
    const row = by.get(c.assigned_to) ?? by.set(c.assigned_to, blank(c.assigned_to, nameById.get(c.assigned_to) ?? '—')).get(c.assigned_to)!;
    const amount = toCollect(c);
    const item = (detail: string): WeeklyCase => ({ id: c.id, plate: c.plate, customer_name: c.customer_name, payer: payerOf(c), amount, collector: row.name, detail });
    if (c.received_on && c.received_on >= from) {
      row.receivedCount++;
      row.receivedAmount += n(c.received_amount);
    }
    if (ilDate(new Date(c.opened_at)) >= from) row.opened++;
    if (c.closed_at) continue;
    row.open++;
    row.openAmount += amount;
    const parked = c.status === 'LEGAL' || c.status === 'BLOCKED';
    const exp = expectedPayment(c, terms);
    if (!parked && exp.date && exp.date < to) {
      row.overdue++;
      overdue.push(item(`צפי ${dm(exp.date)}`));
    }
    if (c.claim_check_due_date && c.claim_check_due_date < to) {
      row.checksPast++;
      checksPast.push(item(`פירעון ${dm(c.claim_check_due_date)}`));
    }
    if (!parked && !active.has(c.id) && c.opened_at < stuckSince) {
      row.stuck++;
      stuck.push(item(c.claim_stage ? `מצב: ${c.claim_stage}` : 'ללא מצב'));
    }
  }
  for (const [uid, cnt] of Array.from(lateBy)) {
    const r = by.get(uid);
    if (r) r.lateReminders = cnt;
  }
  const rows = Array.from(by.values()).filter((r) => r.open || r.receivedCount || r.opened).sort((a, b) => b.openAmount - a.openAmount);
  const total = rows.reduce((t, r) => {
    for (const k of ['open', 'openAmount', 'receivedCount', 'receivedAmount', 'opened', 'overdue', 'stuck', 'checksPast', 'lateReminders'] as const) t[k] += r[k];
    return t;
  }, blank('total', 'סה״כ'));
  const big = (a: WeeklyCase, b: WeeklyCase) => b.amount - a.amount;
  return { from, to, rows, total, stuck: stuck.sort(big).slice(0, 15), overdue: overdue.sort(big).slice(0, 15), checksPast: checksPast.sort(big).slice(0, 15) };
}

const ils = (v: number) => `₪${Math.round(v).toLocaleString('he-IL')}`;

/** The push / bell text — one value per line, with its label. */
export function weeklyText(s: WeeklySummary): { title: string; body: string } {
  const t = s.total;
  const lines = [
    `נגבה השבוע: ${ils(t.receivedAmount)} (${t.receivedCount} תיקים)`,
    `תיקים פתוחים: ${t.open} · ${ils(t.openAmount)}`,
    `באיחור לפי צפי: ${t.overdue}`,
    `צ׳קים שעבר מועד פירעונם: ${t.checksPast}`,
    `תקועים (${STUCK_DAYS}+ יום בלי טיפול): ${t.stuck}`,
    `תזכורות שלא בוצעו: ${t.lateReminders}`,
    ...s.rows.map((r) => `${r.name}: ${r.open} פתוחים, נגבו ${ils(r.receivedAmount)}, תקועים ${r.stuck}`),
  ];
  return { title: `📊 סיכום גבייה שבועי (${dm(s.from)}–${dm(s.to)})`, body: lines.join('\n') };
}
