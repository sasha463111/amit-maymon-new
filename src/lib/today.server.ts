import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWeeklySummary } from '@/lib/collectionsWeekly.server';

// "מה מחכה לי היום" (Amit, 2026-10-15 — from the design demo, now on real
// data). One loader for every role's home cards; the CEO sees them all (and
// can switch role views). Counts are company-wide (both branches). Each card
// links to the existing screen; on a computer it also previews a few items.

import type { TodayCard, TodayCtx, TodayItem, TodayRole } from '@/lib/todayTypes';
export { ROLE_TABS } from '@/lib/todayTypes';
export type { TodayCard, TodayCtx, TodayItem, TodayRole };

const dayMs = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / dayMs)) : 0);
const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
type CarJoin = { license_plate: string | null } | { license_plate: string | null }[] | null;
const plateOf = (c: CarJoin) => (Array.isArray(c) ? c[0]?.license_plate : c?.license_plate) ?? null;

// Cases of my branches (empty list = all, e.g. the CEO preview).
function inBranches<Q>(q: Q, ctx?: TodayCtx): Q {
  return ctx && !ctx.supervisor && ctx.branchIds.length ? (q as unknown as { in: (col: string, vals: string[]) => Q }).in('branch_id', ctx.branchIds) : q;
}

/** Cars whose ENTER_WORK step is done but the painter hasn't marked "נכנס לעבודה"
 *  — the same list as the daily reminder. */
async function waitingToEnter(db: SupabaseClient, ctx?: TodayCtx) {
  const { data: runs } = await db.from('case_workflow_runs').select('id, case_id').eq('workflow_type', 'PROFESSIONAL').eq('status', 'ACTIVE');
  const rs = (runs ?? []) as { id: string; case_id: string }[];
  if (!rs.length) return [];
  const { data: steps } = await db.from('case_workflow_steps').select('run_id').in('run_id', rs.map((r) => r.id)).eq('step_key', 'ENTER_WORK').eq('state', 'DONE');
  const byRun = new Map(rs.map((r) => [r.id, r.case_id]));
  const ids = ((steps ?? []) as { run_id: string }[]).map((s) => byRun.get(s.run_id)).filter((x): x is string => !!x);
  if (!ids.length) return [];
  const { data } = await inBranches(
    db.from('cases').select('id, customer_name, updated_at, cars(license_plate)').in('id', ids).is('closed_at', null).is('deleted_at', null).is('painter_entered_work_at', null).is('painter_finished_at', null),
    ctx,
  );
  return (data ?? []) as { id: string; customer_name: string | null; updated_at: string; cars: CarJoin }[];
}

export async function loadToday(db: SupabaseClient, role: TodayRole, ctx?: TodayCtx): Promise<TodayCard[]> {
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

  if (role === 'advisor') {
    // Advisor / service manager: painter requests to answer, extras, the branch's open
    // cases, cases waiting for parts, cars the painter finished (15/10).
    type P = { id: string; description: string | null; created_at: string; case_id: string; cases: { cars: CarJoin; branch_id: string } | { cars: CarJoin; branch_id: string }[] | null };
    const branchOk = (p: P) => !ctx || ctx.supervisor || !ctx.branchIds.length || ctx.branchIds.includes((Array.isArray(p.cases) ? p.cases[0] : p.cases)?.branch_id ?? '');
    const [reqs, extras, open, parts, finished] = await Promise.all([
      db.from('painter_requests').select('id, description, request_type, created_at, case_id, cases(branch_id, cars(license_plate))').eq('status', 'PENDING').order('created_at').limit(200),
      db.from('bodywork_extras').select('id, description, created_at, case_id, cases(branch_id, cars(license_plate))').eq('status', 'IN_TREATMENT').order('created_at').limit(200),
      inBranches(db.from('cases').select('id, customer_name, opened_at, cars(license_plate)').is('deleted_at', null).is('closed_at', null).order('opened_at', { ascending: false }).limit(500), ctx),
      inBranches(db.from('cases').select('id, customer_name, cars(license_plate)').is('deleted_at', null).is('closed_at', null).eq('parts_ordered', true).eq('parts_arrived', false).limit(200), ctx),
      inBranches(db.from('cases').select('id, customer_name, painter_finished_at, cars(license_plate)').is('deleted_at', null).is('closed_at', null).not('painter_finished_at', 'is', null).is('treatment_finished_at', null).order('painter_finished_at').limit(200), ctx),
    ]);
    const carOf = (p: P) => plateOf((Array.isArray(p.cases) ? p.cases[0] : p.cases)?.cars ?? null);
    const r = ((reqs.data ?? []) as P[]).filter(branchOk);
    const e = ((extras.data ?? []) as P[]).filter(branchOk);
    type C = { id: string; customer_name: string | null; opened_at?: string; painter_finished_at?: string; cars: CarJoin };
    const op = (open.data ?? []) as C[];
    const pw = (parts.data ?? []) as C[];
    const fin = (finished.data ?? []) as C[];
    return [
      { key: 'requests', num: String(r.length), label: 'בקשות פחחים ממתינות לתשובה', tone: r.length ? 'late' : 'ok', href: '/painters',
        items: r.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'בקשה', sub: `לפני ${daysSince(x.created_at)} ימים`, href: `/go/${x.case_id}` })) },
      { key: 'finished', num: String(fin.length), label: 'הפחח סיים — להמשך טיפול', tone: fin.length ? 'warn' : 'ok', href: '/cases',
        items: fin.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', sub: `סיים לפני ${daysSince(c.painter_finished_at ?? null)} ימים`, href: `/go/${c.id}` })) },
      { key: 'parts', num: String(pw.length), label: 'ממתינים לחלקים', tone: pw.length ? 'warn' : 'ok', href: '/cases',
        items: pw.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', href: `/go/${c.id}` })) },
      { key: 'open', num: String(op.length), label: 'תיקים פתוחים בסניף', tone: 'info', href: '/cases',
        items: op.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', sub: `נפתח לפני ${daysSince(c.opened_at ?? null)} ימים`, href: `/go/${c.id}` })) },
      { key: 'extras', num: String(e.length), label: 'תוספות בטיפול', tone: 'info', href: '/extras',
        items: e.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'תוספת', sub: `לפני ${daysSince(x.created_at)} ימים`, href: `/go/${x.case_id}` })) },
    ];
  }

  if (role === 'painter') {
    // The painter's own day (15/10): cars to start, cars in work, parts that
    // arrived, my requests (waiting / answered), my extras.
    const mine = ctx && !ctx.supervisor ? ctx.userId : null;
    const since3 = new Date(Date.now() - 3 * dayMs).toISOString();
    const [waiting, inWork, myReqs, answered, myExtras] = await Promise.all([
      waitingToEnter(db, ctx),
      inBranches(db.from('cases').select('id, customer_name, painter_entered_work_at, parts_arrived, parts_arrived_at, cars(license_plate)').is('deleted_at', null).is('closed_at', null).not('painter_entered_work_at', 'is', null).is('painter_finished_at', null).order('painter_entered_work_at').limit(200), ctx),
      (mine ? db.from('painter_requests').select('id, description, created_at, case_id, cases(cars(license_plate))').eq('created_by', mine) : db.from('painter_requests').select('id, description, created_at, case_id, cases(cars(license_plate))')).in('status', ['PENDING', 'IN_PROGRESS']).order('created_at').limit(100),
      (mine ? db.from('painter_requests').select('id, description, response_note, updated_at, case_id, cases(cars(license_plate))').eq('created_by', mine) : db.from('painter_requests').select('id, description, response_note, updated_at, case_id, cases(cars(license_plate))')).eq('status', 'DONE').gte('updated_at', since3).order('updated_at', { ascending: false }).limit(50),
      (mine ? db.from('bodywork_extras').select('id, description, created_at, case_id, cases(cars(license_plate))').eq('created_by', mine) : db.from('bodywork_extras').select('id, description, created_at, case_id, cases(cars(license_plate))')).eq('status', 'IN_TREATMENT').order('created_at').limit(100),
    ]);
    type W = { id: string; customer_name: string | null; painter_entered_work_at?: string; parts_arrived?: boolean | null; parts_arrived_at?: string | null; cars: CarJoin };
    type P = { id: string; description: string | null; created_at?: string; updated_at?: string; response_note?: string | null; case_id: string; cases: { cars: CarJoin } | { cars: CarJoin }[] | null };
    const carOf = (p: P) => plateOf((Array.isArray(p.cases) ? p.cases[0] : p.cases)?.cars ?? null);
    const wk = (inWork.data ?? []) as W[];
    const partsNew = wk.filter((c) => c.parts_arrived && c.parts_arrived_at && new Date(c.parts_arrived_at).getTime() > Date.now() - 3 * dayMs);
    const rq = (myReqs.data ?? []) as P[];
    const an = (answered.data ?? []) as P[];
    const ex = (myExtras.data ?? []) as P[];
    return [
      { key: 'start', num: String(waiting.length), label: 'רכבים שמחכים שתסמן "נכנס לעבודה"', tone: waiting.length ? 'late' : 'ok', href: '/painters',
        items: waiting.slice(0, 6).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', href: `/painters/${c.id}` })) },
      { key: 'work', num: String(wk.length), label: 'רכבים בעבודה', tone: 'info', href: '/painters',
        items: wk.slice(0, 6).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', sub: `בעבודה ${daysSince(c.painter_entered_work_at ?? null)} ימים${c.parts_arrived ? ' · חלקים הגיעו' : ''}`, href: `/painters/${c.id}` })) },
      { key: 'parts', num: String(partsNew.length), label: 'חלקים הגיעו (3 ימים אחרונים)', tone: partsNew.length ? 'warn' : 'ok', href: '/painters',
        items: partsNew.slice(0, 4).map((c) => ({ plate: plateOf(c.cars), title: c.customer_name || '—', href: `/painters/${c.id}` })) },
      { key: 'myreq', num: String(rq.length), label: 'הבקשות שלי — ממתינות לתשובה', tone: rq.length ? 'warn' : 'ok', href: '/painters',
        items: rq.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'בקשה', sub: `לפני ${daysSince(x.created_at ?? null)} ימים`, href: `/painters/${x.case_id}` })) },
      { key: 'answered', num: String(an.length), label: 'בקשות שלי שנענו (3 ימים)', tone: 'ok', href: '/painters',
        items: an.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'בקשה', sub: x.response_note || 'בוצע', href: `/painters/${x.case_id}` })) },
      { key: 'extras', num: String(ex.length), label: 'התוספות שלי בטיפול', tone: 'info', href: '/extras/mine',
        items: ex.slice(0, 4).map((x) => ({ plate: carOf(x), title: x.description || 'תוספת', href: `/painters/${x.case_id}` })) },
    ];
  }

  if (role === 'driver') {
    const [out, fleet] = await Promise.all([
      db.from('loaner_handovers').select('id, loaner_plate, customer_name, given_at').is('returned_at', null).order('given_at').limit(200),
      db.from('loaner_fleet').select('id', { count: 'exact', head: true }).eq('active', true),
    ]);
    const o = (out.data ?? []) as { id: string; loaner_plate: string; customer_name: string | null; given_at: string }[];
    const long = o.filter((h) => daysSince(h.given_at) > 7);
    return [
      { key: 'out', num: String(o.length), label: 'רכבים חליפיים אצל לקוחות', tone: 'info', href: '/loaners',
        items: o.slice(0, 6).map((h) => ({ plate: h.loaner_plate, title: h.customer_name || 'לקוח', sub: `${daysSince(h.given_at)} ימים` })) },
      { key: 'long', num: String(long.length), label: 'אצל לקוח מעל 7 ימים', tone: long.length ? 'warn' : 'ok', href: '/loaners',
        items: long.slice(0, 4).map((h) => ({ plate: h.loaner_plate, title: h.customer_name || 'לקוח', sub: `${daysSince(h.given_at)} ימים` })) },
      { key: 'free', num: String(Math.max(0, (fleet.count ?? 0) - o.length)), label: 'רכבים פנויים בצי', tone: 'ok', href: '/loaners' },
    ];
  }

  if (role === 'collections' && ctx && !ctx.supervisor) {
    // A collector: her own claims only, and no money summaries (the rule since 14/10).
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const [mineOpen, rem] = await Promise.all([
      db.from('collection_cases').select('id, plate, customer_name, claim_stage, claim_check_due_date, status, received_on').eq('assigned_to', ctx.userId).is('closed_at', null).limit(1000),
      db.from('collection_case_events').select('id, case_id, body, remind_at').eq('remind_user', ctx.userId).is('remind_done_at', null).lte('remind_at', new Date(Date.now() + dayMs).toISOString()).not('remind_at', 'is', null).order('remind_at').limit(100),
    ]);
    type M = { id: string; plate: string; customer_name: string | null; claim_stage: string | null; claim_check_due_date: string | null; status: string; received_on: string | null };
    const op = ((mineOpen.data ?? []) as M[]).filter((c) => c.status !== 'LEGAL');
    const late = op.filter((c) => !c.received_on && c.claim_check_due_date && c.claim_check_due_date < today && c.status !== 'PAID' && c.status !== 'PARTIAL');
    const rs = (rem.data ?? []) as { id: string; case_id: string; body: string; remind_at: string }[];
    return [
      { key: 'reminders', num: String(rs.length), label: 'התזכורות שלי להיום', tone: rs.length ? 'warn' : 'ok', href: '/collections',
        items: rs.slice(0, 5).map((x) => ({ title: x.body, href: `/collections/${x.case_id}` })) },
      { key: 'late', num: String(late.length), label: 'התביעות שלי שעבר מועד הפירעון', tone: late.length ? 'late' : 'ok', href: '/collections',
        items: late.slice(0, 5).map((c) => ({ plate: c.plate, title: c.customer_name || '—', sub: c.claim_stage ?? undefined, href: `/collections/${c.id}` })) },
      { key: 'open', num: String(op.length), label: 'התביעות שלי בטיפול', tone: 'info', href: '/collections' },
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
