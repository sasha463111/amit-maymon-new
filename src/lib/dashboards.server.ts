import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { netDue } from '@/lib/collections';

// "📊 דשבורדים" (Tomer, 15/10) — one summary per module (returns, insurance
// claims, loaner cars, repair cases), each computed for "all branches" and for
// every branch, so the page switches branch without another round trip.
// CEO-only page; read with the service client after the role check.

export type Rank = { label: string; value: number; hint?: string };
export type Day = { date: string; value: number };

export type ReturnsDash = {
  waitingPickup: number; pickupOver7: number; pickupOver14: number;
  waitingCredit: number; creditOver14: number;
  creditedMonth: number; creditedMonthSum: number;
  today: { marked: number; collected: number; credited: number };
  suppliers: Rank[]; daily: Day[];
};
export type ClaimsDash = {
  open: number; toCollect: number; overdue: number; overdueSum: number;
  paidMonth: number; paidMonthSum: number; legal: number; updatesToday: number;
  stages: Rank[]; collectors: Rank[]; daily: Day[];
};
export type LoanersDash = { fleet: number; busy: number; free: number; outOver7: number; testsDue: number; handedWeek: number; returnedWeek: number; longest: Rank[] };
export type CasesDash = { open: number; new7: number; closed7: number; waitingParts: number; inPainterWork: number; avgOpenDays: number; referrals7: number; daily: Day[] };
export type BranchDash = { returns: ReturnsDash; claims: ClaimsDash; loaners: LoanersDash; cases: CasesDash };
export type Dashboards = { branches: { id: string; name: string }[]; byBranch: Record<string, BranchDash>; at: string };

const DAY = 86_400_000;
const ilDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const dayOf = (iso: string | null | undefined) => (iso ? ilDate(new Date(iso)) : '');

function lastDays(n: number, today: string): string[] {
  const t = new Date(today + 'T12:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => new Date(t - (n - 1 - i) * DAY).toISOString().slice(0, 10));
}
function countByDay(isoDates: (string | null)[], days: string[]): Day[] {
  const m = new Map(days.map((d) => [d, 0]));
  for (const iso of isoDates) {
    const d = dayOf(iso);
    if (m.has(d)) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return days.map((d) => ({ date: d, value: m.get(d) ?? 0 }));
}
function top(map: Map<string, number>, n = 6): Rank[] {
  return Array.from(map.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }));
}
const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export async function loadDashboards(): Promise<Dashboards | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const today = ilDate(new Date());
  const month = today.slice(0, 7);
  const days14 = lastDays(14, today);
  const since14 = new Date(now - 15 * DAY).toISOString();

  const [br, pr, cc, ce, fleet, ho, cs, rf, people] = await Promise.all([
    db.from('branches').select('id, name').order('name'),
    db.from('part_returns').select('branch_id, supplier, supplier_other, status, created_at, placed_at, collected_at, credited_at, credit_amount').limit(10000),
    db.from('collection_cases').select('id, branch_id, status, closed_at, claim_stage, assigned_to, amount_due, vat_offset, reinstatement, offset_amount, received_amount, received_on, claim_check_due_date, legal_sent_on, legal_closed_on').limit(10000),
    db.from('collection_case_events').select('case_id, created_at').gte('created_at', since14).limit(20000),
    db.from('loaner_fleet').select('id, plate, car_type, branch_id, active, test_until'),
    db.from('loaner_handovers').select('fleet_id, loaner_plate, branch_id, customer_name, given_at, returned_at').limit(10000),
    db.from('cases').select('branch_id, general_status, created_at, closed_at, parts_ordered, parts_arrived, painter_entered_work_at, painter_finished_at, deleted_at').is('deleted_at', null).limit(10000),
    db.from('referrals').select('branch_id, created_at').gte('created_at', new Date(now - 7 * DAY).toISOString()).limit(10000),
    db.from('profiles').select('id, full_name'),
  ]);

  const branches = ((br.data ?? []) as { id: string; name: string }[]);
  const nameById = new Map(((people.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '—']));
  type PR = { branch_id: string | null; supplier: string | null; supplier_other: string | null; status: string; created_at: string; placed_at: string | null; collected_at: string | null; credited_at: string | null; credit_amount: number | null };
  type CC = { id: string; branch_id: string | null; status: string; closed_at: string | null; claim_stage: string | null; assigned_to: string | null; amount_due: number | null; vat_offset: number | null; reinstatement: number | null; offset_amount: number | null; received_amount: number | null; received_on: string | null; claim_check_due_date: string | null; legal_sent_on: string | null; legal_closed_on: string | null };
  type FL = { id: string; plate: string; car_type: string; branch_id: string | null; active: boolean; test_until: string | null };
  type HO = { fleet_id: string | null; loaner_plate: string; branch_id: string | null; customer_name: string | null; given_at: string; returned_at: string | null };
  type CS = { branch_id: string | null; general_status: string; created_at: string; closed_at: string | null; parts_ordered: boolean | null; parts_arrived: boolean | null; painter_entered_work_at: string | null; painter_finished_at: string | null };
  const allPr = (pr.data ?? []) as PR[];
  const allCc = (cc.data ?? []) as CC[];
  const ccBranch = new Map(allCc.map((c) => [c.id, c.branch_id]));
  const allCe = ((ce.data ?? []) as { case_id: string; created_at: string }[]).map((e) => ({ ...e, branch_id: ccBranch.get(e.case_id) ?? null }));
  const allFl = (fleet.data ?? []) as FL[];
  const allHo = (ho.data ?? []) as HO[];
  const allCs = (cs.data ?? []) as CS[];
  const allRf = (rf.data ?? []) as { branch_id: string | null; created_at: string }[];

  const ageDays = (iso: string | null) => (iso ? (now - new Date(iso).getTime()) / DAY : 0);
  const pick = <T extends { branch_id: string | null }>(rows: T[], b: string) => (b ? rows.filter((r) => r.branch_id === b) : rows);

  function build(b: string): BranchDash {
    // ---- returns ----
    const prs = pick(allPr, b);
    const pickup = prs.filter((r) => r.status === 'WAITING_PICKUP');
    const credit = prs.filter((r) => r.status !== 'WAITING_PICKUP' && !r.credited_at);
    const creditedMonth = prs.filter((r) => r.credited_at && dayOf(r.credited_at).startsWith(month));
    const suppliers = new Map<string, number>();
    for (const r of [...pickup, ...credit]) inc(suppliers, (r.supplier === 'אחר' ? r.supplier_other : r.supplier) || 'ללא ספק');
    const returns: ReturnsDash = {
      waitingPickup: pickup.length,
      pickupOver7: pickup.filter((r) => ageDays(r.placed_at ?? r.created_at) > 7).length,
      pickupOver14: pickup.filter((r) => ageDays(r.placed_at ?? r.created_at) > 14).length,
      waitingCredit: credit.length,
      creditOver14: credit.filter((r) => ageDays(r.collected_at) > 14).length,
      creditedMonth: creditedMonth.length,
      creditedMonthSum: creditedMonth.reduce((s, r) => s + Number(r.credit_amount ?? 0), 0),
      today: {
        marked: prs.filter((r) => dayOf(r.created_at) === today).length,
        collected: prs.filter((r) => dayOf(r.collected_at) === today).length,
        credited: prs.filter((r) => dayOf(r.credited_at) === today).length,
      },
      suppliers: top(suppliers),
      daily: countByDay(prs.map((r) => r.created_at), days14),
    };

    // ---- insurance claims ----
    const ccs = pick(allCc, b);
    const open = ccs.filter((c) => !c.closed_at && c.status !== 'PAID');
    const overdue = open.filter((c) => c.claim_check_due_date && c.claim_check_due_date < today);
    const paidMonth = ccs.filter((c) => c.received_on && c.received_on.startsWith(month));
    const stages = new Map<string, number>();
    const collectors = new Map<string, number>();
    for (const c of open) {
      inc(stages, c.claim_stage || 'ללא שלב');
      inc(collectors, c.assigned_to ? nameById.get(c.assigned_to) ?? '—' : 'לא משויך');
    }
    const ces = pick(allCe, b);
    const claims: ClaimsDash = {
      open: open.length,
      toCollect: open.reduce((s, c) => s + netDue(c), 0),
      overdue: overdue.length,
      overdueSum: overdue.reduce((s, c) => s + netDue(c), 0),
      paidMonth: paidMonth.length,
      paidMonthSum: paidMonth.reduce((s, c) => s + Number(c.received_amount ?? 0), 0),
      legal: ccs.filter((c) => c.legal_sent_on && !c.legal_closed_on).length,
      updatesToday: ces.filter((e) => dayOf(e.created_at) === today).length,
      stages: top(stages, 8),
      collectors: top(collectors, 8),
      daily: countByDay(ces.map((e) => e.created_at), days14),
    };

    // ---- loaner cars ----
    const fl = pick(allFl, b).filter((f) => f.active);
    const hos = pick(allHo, b);
    const out = hos.filter((h) => !h.returned_at);
    const busyIds = new Set(out.map((h) => h.fleet_id).filter(Boolean));
    const in30 = new Date(now + 30 * DAY).toISOString().slice(0, 10);
    const weekAgo = now - 7 * DAY;
    const loaners: LoanersDash = {
      fleet: fl.length,
      busy: fl.filter((f) => busyIds.has(f.id)).length,
      free: fl.filter((f) => !busyIds.has(f.id)).length,
      outOver7: out.filter((h) => ageDays(h.given_at) > 7).length,
      testsDue: fl.filter((f) => f.test_until && f.test_until <= in30).length,
      handedWeek: hos.filter((h) => new Date(h.given_at).getTime() > weekAgo).length,
      returnedWeek: hos.filter((h) => h.returned_at && new Date(h.returned_at).getTime() > weekAgo).length,
      longest: out
        .map((h) => ({ label: `${h.loaner_plate} — ${h.customer_name ?? 'לקוח'}`, value: Math.floor(ageDays(h.given_at)) }))
        .sort((a, z) => z.value - a.value)
        .slice(0, 6),
    };

    // ---- repair cases ----
    const css = pick(allCs, b);
    const openCases = css.filter((c) => !c.closed_at && c.general_status !== 'COMPLETED');
    const cases: CasesDash = {
      open: openCases.length,
      new7: css.filter((c) => new Date(c.created_at).getTime() > weekAgo).length,
      closed7: css.filter((c) => c.closed_at && new Date(c.closed_at).getTime() > weekAgo).length,
      waitingParts: openCases.filter((c) => c.parts_ordered && !c.parts_arrived).length,
      inPainterWork: openCases.filter((c) => c.painter_entered_work_at && !c.painter_finished_at).length,
      avgOpenDays: openCases.length ? Math.round(openCases.reduce((s, c) => s + ageDays(c.created_at), 0) / openCases.length) : 0,
      referrals7: pick(allRf, b).length,
      daily: countByDay(css.map((c) => c.created_at), days14),
    };
    return { returns, claims, loaners, cases };
  }

  const byBranch: Record<string, BranchDash> = { '': build('') };
  for (const x of branches) byBranch[x.id] = build(x.id);
  return { branches, byBranch, at: new Date().toISOString() };
}
