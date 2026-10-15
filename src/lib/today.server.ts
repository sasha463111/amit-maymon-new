import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWeeklySummary } from '@/lib/collectionsWeekly.server';

// "מה מחכה לי היום" (Amit, 2026-10-15 — from the design demo, now on real
// data). One loader for every role's home cards; the CEO sees them all (and
// can switch role views). Counts are company-wide (both branches). Each card
// links to the existing screen; on a computer it also previews a few items.

import type { TodayCard, TodayItem, TodayRole } from '@/lib/todayTypes';
export { ROLE_TABS } from '@/lib/todayTypes';
export type { TodayCard, TodayItem, TodayRole };

const dayMs = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / dayMs)) : 0);
const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
type CarJoin = { license_plate: string | null } | { license_plate: string | null }[] | null;
const plateOf = (c: CarJoin) => (Array.isArray(c) ? c[0]?.license_plate : c?.license_plate) ?? null;

export async function loadToday(db: SupabaseClient, role: TodayRole): Promise<TodayCard[]> {
  const monthStart = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).slice(0, 7) + '-01T00:00:00+03:00').toISOString();

  if (role === 'warehouse') {
    const [wait, credit, docs, credited] = await Promise.all([
      db.from('part_returns').select('id, plate, description, sku, supplier, supplier_other, created_at').eq('status', 'WAITING_PICKUP').order('created_at').limit(500),
      db.from('part_returns').select('id, plate, description, sku, supplier, supplier_other, collected_at').eq('status', 'COLLECTED').order('collected_at').limit(500),
      db.from('supplier_documents').select('id', { count: 'exact', head: true }).is('verified_at', null),
      db.from('part_returns').select('id', { count: 'exact', head: true }).eq('status', 'CREDITED').gte('credited_at', monthStart),
    ]);
    type R = { id: string; plate: string | null; description: string | null; sku: string | null; supplier: string; supplier_other: string | null; created_at?: string; collected_at?: string | null };
    const w = (wait.data ?? []) as R[];
    const c = (credit.data ?? []) as R[];
    const sup = (r: R) => (r.supplier === 'אחר' ? r.supplier_other || 'אחר' : r.supplier);
    const lateWait = w.filter((r) => daysSince(r.created_at ?? null) >= 7).length;
    return [
      { key: 'pickup', num: String(w.length), label: `חלקים ממתינים לאיסוף נהג${lateWait ? ` · ${lateWait} מעל שבוע` : ''}`, tone: lateWait ? 'late' : 'warn', href: '/returns',
        items: w.slice(0, 4).map((r) => ({ plate: r.plate, title: r.description || r.sku || 'חלק', sub: `${sup(r)} · ${daysSince(r.created_at ?? null)} ימים` })) },
      { key: 'credit', num: String(c.length), label: 'נאספו וממתינים לזיכוי', tone: 'warn', href: '/returns',
        items: c.slice(0, 4).map((r) => ({ plate: r.plate, title: r.description || r.sku || 'חלק', sub: `${sup(r)} · נאסף לפני ${daysSince(r.collected_at ?? null)} ימים` })) },
      { key: 'docs', num: String(docs.count ?? 0), label: 'חשבוניות / תעודות לבדיקה', tone: (docs.count ?? 0) ? 'late' : 'ok', href: '/returns' },
      { key: 'credited', num: String(credited.count ?? 0), label: 'זוכו החודש', tone: 'ok', href: '/returns' },
    ];
  }

  if (role === 'painter') {
    const [reqs, extras] = await Promise.all([
      db.from('painter_requests').select('id, description, request_type, created_at, case_id, cases(cars(license_plate))').eq('status', 'PENDING').order('created_at').limit(200),
      db.from('bodywork_extras').select('id, description, created_at, case_id, cases(cars(license_plate))').eq('status', 'IN_TREATMENT').order('created_at').limit(200),
    ]);
    type P = { id: string; description: string | null; created_at: string; case_id: string; cases: { cars: CarJoin } | { cars: CarJoin }[] | null };
    const carOf = (p: P) => plateOf((Array.isArray(p.cases) ? p.cases[0] : p.cases)?.cars ?? null);
    const r = (reqs.data ?? []) as P[];
    const e = (extras.data ?? []) as P[];
    return [
      { key: 'requests', num: String(r.length), label: 'בקשות פחחים ממתינות לתשובה', tone: r.length ? 'warn' : 'ok', href: '/painters',
        items: r.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'בקשה', sub: `לפני ${daysSince(x.created_at)} ימים`, href: `/go/${x.case_id}` })) },
      { key: 'extras', num: String(e.length), label: 'תוספות בטיפול', tone: 'info', href: '/extras',
        items: e.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'תוספת', sub: `לפני ${daysSince(x.created_at)} ימים`, href: `/go/${x.case_id}` })) },
    ];
  }

  if (role === 'collections') {
    const s = await loadWeeklySummary(db);
    const t = s.total;
    const { data: rem } = await db
      .from('collection_case_events')
      .select('id', { count: 'exact' })
      .is('remind_done_at', null)
      .lte('remind_at', new Date(Date.now() + dayMs).toISOString())
      .not('remind_at', 'is', null);
    const dueRem = (rem ?? []).length;
    return [
      { key: 'overdue', num: String(t.overdue), label: 'תביעות באיחור לפי מועד הפירעון', tone: t.overdue ? 'late' : 'ok', href: '/collections',
        items: s.overdue.slice(0, 4).map((c) => ({ plate: c.plate, title: `${c.payer} · ${ils(c.amount)}`, sub: `${c.collector} · ${c.detail}`, href: `/collections/${c.id}` })) },
      { key: 'checks', num: String(t.checksPast), label: 'צ׳קים שעבר מועד פירעונם', tone: t.checksPast ? 'late' : 'ok', href: '/collections',
        items: s.checksPast.slice(0, 4).map((c) => ({ plate: c.plate, title: `${c.payer} · ${ils(c.amount)}`, sub: `${c.collector} · ${c.detail}`, href: `/collections/${c.id}` })) },
      { key: 'reminders', num: String(dueRem), label: 'תזכורות להיום (כל המסלקות)', tone: dueRem ? 'warn' : 'ok', href: '/collections' },
      { key: 'open', num: String(t.open), label: `תיקי תביעה פתוחים · ${ils(t.openAmount)}`, tone: 'info', href: '/collections', wide: true },
    ];
  }

  // office + ceo share the case picture
  const [closing, open, referrals, loanersOut, fleet] = await Promise.all([
    db.from('cases').select('id, customer_name, treatment_finished_at, cars(license_plate)').is('deleted_at', null).is('closed_at', null).not('treatment_finished_at', 'is', null).order('treatment_finished_at'),
    db.from('cases').select('id, customer_name, opened_at, cars(license_plate)').is('deleted_at', null).is('closed_at', null).is('treatment_finished_at', null).order('opened_at', { ascending: false }),
    db.from('referrals').select('id, customer_name, plate_number, follow_up_date, created_at').eq('status', 'ACTIVE').order('created_at', { ascending: false }),
    db.from('loaner_handovers').select('id', { count: 'exact', head: true }).is('returned_at', null),
    db.from('loaner_fleet').select('id', { count: 'exact', head: true }).eq('active', true),
  ]);
  type C = { id: string; customer_name: string | null; treatment_finished_at?: string; opened_at?: string; cars: CarJoin };
  const cl = (closing.data ?? []) as C[];
  const op = (open.data ?? []) as C[];
  const clIds = cl.map((c) => c.id);
  const { data: fin } = clIds.length ? await db.from('finance_closures').select('case_id').in('case_id', clIds) : { data: [] };
  const withFin = new Set(((fin ?? []) as { case_id: string }[]).map((f) => f.case_id));
  const missingFin = cl.filter((c) => !withFin.has(c.id));
  const refs = (referrals.data ?? []) as { id: string; customer_name: string | null; plate_number: string | null; follow_up_date: string | null }[];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const followDue = refs.filter((r) => r.follow_up_date && r.follow_up_date <= today);
  const fleetN = fleet.count ?? 0;
  const outN = loanersOut.count ?? 0;

  const caseCards: TodayCard[] = [
    { key: 'closing', num: String(cl.length), label: 'תיקים בתהליך סגירה', tone: cl.length ? 'warn' : 'ok', href: '/closure',
      items: cl.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', sub: `סיום טיפול לפני ${daysSince(c.treatment_finished_at ?? null)} ימים`, href: `/go/${c.id}` })) },
    { key: 'finance', num: String(missingFin.length), label: 'חסרים נתוני כספים לסגירה', tone: missingFin.length ? 'late' : 'ok', href: '/closure',
      items: missingFin.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', href: `/go/${c.id}` })) },
    { key: 'referrals', num: String(refs.length), label: `הפניות פתוחות${followDue.length ? ` · ${followDue.length} למעקב היום` : ''}`, tone: followDue.length ? 'warn' : 'info', href: '/referrals',
      items: refs.slice(0, 4).map((r) => ({ plate: r.plate_number, title: r.customer_name || '—', sub: r.follow_up_date ? `מעקב: ${r.follow_up_date.split('-').reverse().join('/')}` : undefined })) },
    { key: 'loaners', num: fleetN ? `${fleetN - outN}` : String(outN), label: fleetN ? `רכבים חליפיים פנויים · ${outN} אצל לקוחות` : `רכבים חליפיים אצל לקוחות (רשימת הצי עוד לא הוזנה)`, tone: 'info', href: '/loaners' },
  ];
  if (role === 'office') return caseCards;

  const [approvals, reqs, extras, returnsWait, s] = await Promise.all([
    db.from('ceo_approvals').select('id', { count: 'exact', head: true }).not('status', 'in', '(APPROVED,REJECTED)'),
    db.from('app_requests').select('id', { count: 'exact', head: true }).in('status', ['NEW', 'IN_PROGRESS']),
    db.from('bodywork_extras').select('id', { count: 'exact', head: true }).eq('status', 'IN_TREATMENT'),
    db.from('part_returns').select('id, created_at').eq('status', 'WAITING_PICKUP').limit(1000),
    loadWeeklySummary(db),
  ]);
  const rw = (returnsWait.data ?? []) as { created_at: string }[];
  const rwLate = rw.filter((r) => daysSince(r.created_at) >= 14).length;
  return [
    { key: 'approvals', num: String(approvals.count ?? 0), label: 'ממתינים לאישורך', tone: (approvals.count ?? 0) ? 'warn' : 'ok', href: '/approvals' },
    { key: 'open', num: String(op.length), label: 'תיקים בטיפול', tone: 'info', href: '/cases',
      items: op.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', sub: `נפתח לפני ${daysSince(c.opened_at ?? null)} ימים`, href: `/go/${c.id}` })) },
    ...caseCards.slice(0, 2),
    { key: 'claims', num: String(s.total.overdue), label: `תביעות באיחור · מתוך ${s.total.open} פתוחות`, tone: s.total.overdue ? 'late' : 'ok', href: '/collections',
      items: s.overdue.slice(0, 4).map((c) => ({ plate: c.plate, title: `${c.payer} · ${ils(c.amount)}`, sub: c.detail, href: `/collections/${c.id}` })) },
    { key: 'returns', num: String(rw.length), label: `החזרות ממתינות לאיסוף${rwLate ? ` · ${rwLate} מעל שבועיים` : ''}`, tone: rwLate ? 'late' : 'warn', href: '/returns' },
    { key: 'extras', num: String(extras.count ?? 0), label: 'תוספות בטיפול', tone: 'info', href: '/extras' },
    { key: 'requests', num: String(reqs.count ?? 0), label: 'בקשות שלך בטיפול הפיתוח', tone: 'info', href: '/requests' },
    { key: 'money', num: ils(s.total.openAmount), label: `פתוח לגבייה בתביעות · נגבה השבוע ${ils(s.total.receivedAmount)}`, tone: 'info', href: '/collections', wide: true },
  ];
}
