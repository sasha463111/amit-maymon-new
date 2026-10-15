'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setReceivablesViewer, type ReceivablesData } from '@/app/actions/receivables';
import type { CollectionCase } from '@/app/actions/collections';
import { expectedPayment, payerOf, workingDaysBetween, daysLate } from '@/lib/collections';
import { StatCard, type Tone } from '@/components/ui/kit';
import { LicensePlate } from '@/components/ui/LicensePlate';

// "דשבורד גבייה" (Amit, 2026-10-14): the money side of collections, CEO + approved.
// Sections: snapshot · expected cash flow · aging · per insurer · collected per
// month · offsets · legal · collectors' output · access (CEO).

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const ROLE_LABEL: Record<string, string> = {
  OFFICE: 'משרד', SERVICE_MANAGER: 'מנהל שירות', SERVICE_ADVISOR: 'יועצת שירות', PAINTER: 'פחח',
  WAREHOUSE: 'מחסנאי', WAREHOUSE_MANAGER: 'מנהל מחסן', COLLECTIONS: 'מסלקת תביעות',
};
const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

type Period = 'month' | 'quarter' | 'half' | 'year' | 'all';
function inPeriod(iso: string | null, p: Period, t0: string): boolean {
  if (!iso) return false;
  if (p === 'all') return true;
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  const ty = t0.slice(0, 4);
  const tm = Number(t0.slice(5, 7));
  if (y !== ty) return false;
  if (p === 'year') return true;
  if (p === 'half') return Math.ceil(m / 6) === Math.ceil(tm / 6);
  if (p === 'quarter') return Math.ceil(m / 3) === Math.ceil(tm / 3);
  return m === tm;
}
const PERIOD_LABEL: Record<Period, string> = { month: 'החודש', quarter: 'הרבעון', half: 'החציון', year: 'השנה', all: 'הכול' };

const toCollect = (c: CollectionCase) => (c.amount_due ?? 0) - (c.vat_offset ?? 0) - (c.reinstatement ?? 0);
/** Open balance: net of the offset (קיזוז) and of what already came in. */
const balance = (c: CollectionCase) => Math.max(0, toCollect(c) - (c.offset_amount ?? 0) - (c.received_amount ?? 0));
const isOpen = (c: CollectionCase) => !c.closed_at;

function Bar({ value, max, tone = 'bg-indigo-500' }: { value: number; max: number; tone?: string }) {
  return (
    <div className="h-2 rounded bg-gray-100">
      <div className={`h-2 rounded ${tone}`} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// The shared kit (15/10, "עיצוב אחיד"): the old colour classes → kit tones.
function Kpi({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  const t: Tone = tone.includes('red') ? 'bad' : tone.includes('green') ? 'good' : tone.includes('amber') ? 'warn' : tone.includes('purple') ? 'info' : 'neutral';
  return <StatCard label={label} value={value} hint={hint} tone={t} />;
}

export function ReceivablesClient({ data }: { data: ReceivablesData }) {
  const { cases, unopened, terms, collectors, isCeo, isManager, viewers } = data;
  const [period, setPeriod] = useState<Period>('month');
  const t0 = today();
  const thisMonth = t0.slice(0, 7);

  const rows = useMemo(() => cases.map((c) => ({ c, exp: expectedPayment(c, terms) })), [cases, terms]);
  const open = rows.filter((r) => isOpen(r.c) && r.c.status !== 'LEGAL' && r.c.status !== 'BLOCKED');
  const blockedCases = cases.filter((c) => c.status === 'BLOCKED');
  const overdue = open.filter((r) => r.exp.date && r.exp.date < t0);
  const legalOpen = cases.filter((c) => c.status === 'LEGAL' && !c.legal_closed_on);
  const paidInPeriod = cases.filter((c) => (c.status === 'PAID' || c.status === 'PARTIAL') && inPeriod(c.received_on, period, t0));
  const collectedInPeriod = paidInPeriod.reduce((s, c) => s + (c.received_amount ?? 0), 0)
    + cases.filter((c) => c.legal_closed_on && inPeriod(c.legal_closed_on, period, t0)).reduce((s, c) => s + (c.legal_recovered_amount ?? 0), 0);
  const offsetsInPeriod = paidInPeriod.filter((c) => (c.offset_amount ?? 0) > 0);
  const offsetSum = offsetsInPeriod.reduce((s, c) => s + (c.offset_amount ?? 0), 0);
  const billedInPeriod = paidInPeriod.reduce((s, c) => s + toCollect(c), 0);
  const openSum = open.reduce((s, r) => s + balance(r.c), 0);
  const overdueSum = overdue.reduce((s, r) => s + balance(r.c), 0);
  const dueThisMonth = open.filter((r) => r.exp.date?.slice(0, 7) === thisMonth);
  const unopenedSum = unopened.reduce((s, u) => s + u.amount, 0);

  // Expected cash flow: overdue bucket + next 6 months.
  const flow = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i));
    const out = months.map((ym) => {
      const list = open.filter((r) => r.exp.date?.slice(0, 7) === ym && !(r.exp.date < t0));
      return { ym, n: list.length, sum: list.reduce((s, r) => s + balance(r.c), 0) };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, t0]);
  const noDate = open.filter((r) => !r.exp.date);
  const flowMax = Math.max(overdueSum, ...flow.map((f) => f.sum), noDate.reduce((s, r) => s + balance(r.c), 0), 1);

  // Aging of open balance by days past the expected date.
  const aging = [
    { label: 'מועד עוד לא הגיע', test: (d: number | null) => d != null && d <= 0 },
    { label: '1–30 ימי איחור', test: (d: number | null) => d != null && d >= 1 && d <= 30 },
    { label: '31–60', test: (d: number | null) => d != null && d >= 31 && d <= 60 },
    { label: '61–90', test: (d: number | null) => d != null && d >= 61 && d <= 90 },
    { label: 'מעל 90', test: (d: number | null) => d != null && d > 90 },
    { label: 'ללא צפי (חסר אישור / הסכם)', test: (d: number | null) => d == null },
  ].map((b) => {
    const list = open.filter((r) => b.test(r.exp.date ? (r.exp.date < t0 ? daysLate(r.exp.date, t0) : 0) : null));
    return { ...b, n: list.length, sum: list.reduce((s, r) => s + balance(r.c), 0) };
  });
  const agingMax = Math.max(...aging.map((a) => a.sum), 1);

  // Per insurer / payer.
  const payers = useMemo(() => {
    const m = new Map<string, { open: number; balance: number; late: number; lateSum: number; collected: number; offsets: number; days: number[]; unopened: number }>();
    const get = (k: string) => {
      if (!m.has(k)) m.set(k, { open: 0, balance: 0, late: 0, lateSum: 0, collected: 0, offsets: 0, days: [], unopened: 0 });
      return m.get(k)!;
    };
    for (const r of open) {
      const v = get(payerOf(r.c) || '—');
      v.open++;
      v.balance += balance(r.c);
      if (r.exp.date && r.exp.date < t0) {
        v.late++;
        v.lateSum += balance(r.c);
      }
    }
    for (const c of paidInPeriod) {
      const v = get(payerOf(c) || '—');
      v.collected += c.received_amount ?? 0;
      v.offsets += c.offset_amount ?? 0;
      if (c.case_closed_on && c.received_on) v.days.push(daysLate(c.case_closed_on, c.received_on));
    }
    for (const u of unopened) get(u.payer).unopened += u.amount;
    return Array.from(m.entries()).sort((a, b) => b[1].balance + b[1].unopened - (a[1].balance + a[1].unopened));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, unopened, period, t0]);

  // Collected per month (last 12).
  const collectedByMonth = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));
    return months.map((ym) => ({
      ym,
      sum:
        cases.filter((c) => (c.status === 'PAID' || c.status === 'PARTIAL') && c.received_on?.slice(0, 7) === ym).reduce((s, c) => s + (c.received_amount ?? 0), 0) +
        cases.filter((c) => c.legal_closed_on?.slice(0, 7) === ym).reduce((s, c) => s + (c.legal_recovered_amount ?? 0), 0),
    }));
  }, [cases, thisMonth]);
  const collectedMax = Math.max(...collectedByMonth.map((m) => m.sum), 1);

  // Legal by lawyer.
  const lawyers = useMemo(() => {
    const m = new Map<string, { n: number; open: number; disputed: number; closed: number; claimed: number; recovered: number }>();
    for (const c of cases.filter((c) => c.legal_sent_on)) {
      const k = c.legal_lawyer || 'לא צוין';
      const v = m.get(k) ?? { n: 0, open: 0, disputed: 0, closed: 0, claimed: 0, recovered: 0 };
      v.n++;
      if (c.legal_closed_on) {
        v.closed++;
        v.claimed += c.legal_claim_amount ?? 0;
        v.recovered += c.legal_recovered_amount ?? 0;
      } else {
        v.open++;
        v.disputed += c.legal_claim_amount ?? 0;
      }
      m.set(k, v);
    }
    return Array.from(m.entries());
  }, [cases]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">דשבורד גבייה</h1>
          <p className="text-sm text-gray-500">התמונה הכספית של הגבייה · 🔒 מנכ״ל ומורשים בלבד</p>
        </div>
        <div className="flex gap-1">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={`h-9 px-3 rounded-lg border text-sm ${period === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      {data.error && <p className="text-sm text-red-600">⚠️ {data.error}</p>}

      <Section title="1. תמונת מצב" hint={`"נגבה" ו"קיזוזים" — לפי התקופה שנבחרה (${PERIOD_LABEL[period]}). שאר הנתונים — נכון להיום.`}>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <Kpi label="יתרה פתוחה לגבייה" value={ils(openSum)} hint={`${open.length} תיקים בטיפול`} />
          <Kpi label="צפוי להיכנס החודש" value={ils(dueThisMonth.reduce((s, r) => s + balance(r.c), 0))} hint={`${dueThisMonth.length} תיקים`} />
          <Kpi label="באיחור" value={ils(overdueSum)} hint={`${overdue.length} תיקים`} tone={overdue.length ? 'border-red-200 bg-red-50' : ''} />
          <Kpi label={`נגבה ${PERIOD_LABEL[period]}`} value={ils(collectedInPeriod)} hint={`${paidInPeriod.length} תיקים נסגרו`} tone="border-green-200 bg-green-50" />
          <Kpi label={`קיזוזים ${PERIOD_LABEL[period]}`} value={ils(offsetSum)} hint={billedInPeriod ? `${((offsetSum / billedInPeriod) * 100).toFixed(1)}% מהסכום לגבייה · ${offsetsInPeriod.length} תיקים` : `${offsetsInPeriod.length} תיקים`} />
          <Kpi label="במחלקה משפטית" value={ils(legalOpen.reduce((s, c) => s + (c.legal_claim_amount ?? 0), 0))} hint={`${legalOpen.length} תיקים פתוחים`} tone={legalOpen.length ? 'border-purple-200 bg-purple-50' : ''} />
          <Kpi label="ממתין לפתיחת תיק גבייה" value={ils(unopenedSum)} hint={`${unopened.length} סגירות שעוד לא נפתח להן תיק (כולל היסטוריית האקסל)`} tone="border-amber-200 bg-amber-50" />
          <Kpi label="חשבוניות חסומות" value={ils(blockedCases.reduce((s, c) => s + toCollect(c), 0))} hint={`${blockedCases.length} חשבוניות — לא ישולמו עד שישוחררו`} tone={blockedCases.length ? 'border-gray-400 bg-gray-100' : ''} />
          <Kpi label="ממוצע ימי עבודה לתיק" value={(() => { const cl = cases.filter((c) => c.closed_at); return cl.length ? (cl.reduce((s, c) => s + workingDaysBetween(c.opened_at, c.closed_at!), 0) / cl.length).toFixed(1) : '—'; })()} hint="מפתיחת תיק הגבייה עד סגירה" />
        </div>
      </Section>

      <Section title="2. צפי תזרים — מתי הכסף צפוי להיכנס" hint="לפי ההסכם עם כל חברה (פוליסה / הסדר ג׳) ומועד פירעון הצ׳ק (צד ג׳).">
        <div className="space-y-2">
          {[
            { label: '⏰ באיחור (היה צפוי לפני היום)', n: overdue.length, sum: overdueSum, tone: 'bg-red-500' },
            ...flow.map((f) => ({ label: monthLabel(f.ym) + (f.ym === thisMonth ? ' (מהיום)' : ''), n: f.n, sum: f.sum, tone: 'bg-indigo-500' })),
            { label: 'ללא צפי — חסר אישור תשלום / הסכם', n: noDate.length, sum: noDate.reduce((s, r) => s + balance(r.c), 0), tone: 'bg-amber-400' },
          ].map((f) => (
            <div key={f.label} className="grid grid-cols-[180px_1fr_120px] gap-3 items-center text-sm">
              <span>{f.label}</span>
              <Bar value={f.sum} max={flowMax} tone={f.tone} />
              <span className="text-left font-semibold">{ils(f.sum)} <span className="text-gray-400 font-normal text-xs">({f.n})</span></span>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="3. גיול חובות" hint="יתרה פתוחה לפי ימי איחור מהמועד הצפוי.">
          <div className="space-y-2">
            {aging.map((a) => (
              <div key={a.label} className="grid grid-cols-[150px_1fr_110px] gap-3 items-center text-sm">
                <span>{a.label}</span>
                <Bar value={a.sum} max={agingMax} tone={a.label.startsWith('מועד') ? 'bg-green-500' : a.label.startsWith('ללא') ? 'bg-amber-400' : 'bg-red-500'} />
                <span className="text-left font-semibold">{ils(a.sum)} <span className="text-gray-400 font-normal text-xs">({a.n})</span></span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="4. נגבה בפועל — 12 חודשים">
          <div className="space-y-1.5">
            {collectedByMonth.map((m) => (
              <div key={m.ym} className="grid grid-cols-[70px_1fr_100px] gap-3 items-center text-sm">
                <span>{monthLabel(m.ym)}</span>
                <Bar value={m.sum} max={collectedMax} tone="bg-green-500" />
                <span className="text-left">{m.sum ? ils(m.sum) : '—'}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="5. לפי חברת ביטוח" hint={`"נגבה", "קיזוזים" ו"ימים לתשלום" — ${PERIOD_LABEL[period]}. ימים לתשלום = מסגירת התיק במוסך עד שהכסף התקבל.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] [&_td]:py-1.5 [&_th]:py-2 min-w-[860px]">
            <thead className="text-xs text-gray-700 bg-gray-100 sticky top-0 z-10">
              <tr>
                {['חברה', 'תיקים בטיפול', 'יתרה לגבייה', 'באיחור', 'ממתין לפתיחת תיק', 'נגבה', 'קיזוזים', 'ממוצע ימים לתשלום'].map((h) => (
                  <th key={h} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 [&>tr:nth-child(even)]:bg-gray-50/60">
              {payers.map(([k, v]) => (
                <tr key={k}>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{k}</td>
                  <td className="px-2 py-1.5">{v.open || ''}</td>
                  <td className="px-2 py-1.5">{v.balance ? ils(v.balance) : ''}</td>
                  <td className={`px-2 py-1.5 ${v.late ? 'text-red-700 font-semibold' : ''}`}>{v.late ? `${ils(v.lateSum)} (${v.late})` : ''}</td>
                  <td className="px-2 py-1.5 text-amber-800">{v.unopened ? ils(v.unopened) : ''}</td>
                  <td className="px-2 py-1.5 text-green-700">{v.collected ? ils(v.collected) : ''}</td>
                  <td className="px-2 py-1.5">{v.offsets ? ils(v.offsets) : ''}</td>
                  <td className="px-2 py-1.5">{v.days.length ? (v.days.reduce((s, d) => s + d, 0) / v.days.length).toFixed(0) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="6. קיזוזים — סיבות" hint={PERIOD_LABEL[period]}>
          {offsetsInPeriod.length === 0 ? (
            <p className="text-sm text-gray-400">אין קיזוזים בתקופה</p>
          ) : (
            <ul className="text-sm space-y-1">
              {offsetsInPeriod
                .slice()
                .sort((a, b) => (b.offset_amount ?? 0) - (a.offset_amount ?? 0))
                .map((c) => (
                  <li key={c.id}>
                    <b>{ils(c.offset_amount ?? 0)}</b> · {payerOf(c)} · <span className="inline-block align-middle"><LicensePlate plate={c.plate} size="sm" /></span> — {c.partial_reason}
                  </li>
                ))}
            </ul>
          )}
        </Section>

        <Section title="7. מחלקה משפטית — לפי עורך דין" hint="נתבע מול התקבל בתביעות שהסתיימו.">
          {lawyers.length === 0 ? (
            <p className="text-sm text-gray-400">אין תיקים שהועברו</p>
          ) : (
            <table className="w-full text-[13px] [&_td]:py-1.5 [&_th]:py-2">
              <thead className="text-xs text-gray-500">
                <tr>
                  {['עורך דין', 'פתוחים', 'במחלוקת', 'הסתיימו', 'נתבע', 'התקבל', '%'].map((h) => (
                    <th key={h} className="text-right font-semibold py-1">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lawyers.map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="py-1">{k}</td>
                    <td>{v.open}</td>
                    <td>{v.disputed ? ils(v.disputed) : ''}</td>
                    <td>{v.closed}</td>
                    <td>{v.claimed ? ils(v.claimed) : ''}</td>
                    <td>{v.recovered ? ils(v.recovered) : ''}</td>
                    <td className="font-semibold">{v.claimed ? `${Math.round((v.recovered / v.claimed) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="8. תפוקת מסלקות" hint="ימי עבודה = א׳–ה׳ מפתיחת תיק הגבייה עד סגירה.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] [&_td]:py-1.5 [&_th]:py-2 min-w-[760px]">
            <thead className="text-xs text-gray-700 bg-gray-100 sticky top-0 z-10">
              <tr>
                {['מסלקת', 'בטיפול', 'יתרה בטיפול', 'באיחור', `נסגרו ${PERIOD_LABEL[period]}`, ...(isManager ? [`נגבה ${PERIOD_LABEL[period]}`] : []), 'ממוצע ימי עבודה', 'קיזוזים'].map((h) => (
                  <th key={h} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 [&>tr:nth-child(even)]:bg-gray-50/60">
              {collectors.map((p) => {
                const mine = rows.filter((r) => r.c.assigned_to === p.id);
                const mOpen = mine.filter((r) => isOpen(r.c) && r.c.status !== 'LEGAL');
                const mLate = mOpen.filter((r) => r.exp.date && r.exp.date < t0);
                const mPaid = paidInPeriod.filter((c) => c.assigned_to === p.id);
                const mClosed = mine.filter((r) => r.c.closed_at);
                const avg = mClosed.length ? mClosed.reduce((s, r) => s + workingDaysBetween(r.c.opened_at, r.c.closed_at!), 0) / mClosed.length : null;
                return (
                  <tr key={p.id}>
                    <td className="px-2 py-1.5 font-semibold">{p.name}</td>
                    <td className="px-2 py-1.5">{mOpen.length}</td>
                    <td className="px-2 py-1.5">{ils(mOpen.reduce((s, r) => s + balance(r.c), 0))}</td>
                    <td className={`px-2 py-1.5 ${mLate.length ? 'text-red-700 font-semibold' : ''}`}>{mLate.length}</td>
                    <td className="px-2 py-1.5">{mPaid.length}</td>
                    {isManager && <td className="px-2 py-1.5 text-green-700">{ils(mPaid.reduce((s, c) => s + (c.received_amount ?? 0), 0))}</td>}
                    <td className="px-2 py-1.5">{avg == null ? '—' : avg.toFixed(1)}</td>
                    <td className="px-2 py-1.5">{ils(mPaid.reduce((s, c) => s + (c.offset_amount ?? 0), 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {isManager && <CollectedByCollector cases={cases} collectors={collectors} />}

      {isCeo && <AccessPanel viewers={viewers} />}
    </div>
  );
}

function AccessPanel({ viewers }: { viewers: ReceivablesData['viewers'] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function toggle(id: string, on: boolean) {
    setBusy(id);
    setMsg(null);
    const r = await setReceivablesViewer(id, on);
    setBusy(null);
    if (r.error) setMsg(`⚠️ ${r.error}`);
    else router.refresh();
  }
  return (
    <Section title="🔒 הרשאות צפייה בדשבורד" hint="מי עוד רואה את הדשבורד הזה (מלבדך). מסמנים ומבטלים בלחיצה.">
      <div className="grid gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {viewers.map((v) => (
          <label key={v.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${v.granted ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}`}>
            <input type="checkbox" checked={v.granted} disabled={busy === v.id} onChange={(e) => void toggle(v.id, e.target.checked)} className="w-4 h-4" />
            <span className="font-semibold">{v.name}</span>
            <span className="text-xs text-gray-500">{ROLE_LABEL[v.role] ?? v.role}</span>
          </label>
        ))}
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </Section>
  );
}

/** "כמה גבתה כל מסלקת" — CEO + bookkeeper only (Amit, 2026-10-14). Money that
 *  came in on a collector's cases (received + legal recovered), by the date it
 *  came in: this month / quarter / year, and month by month. */
function CollectedByCollector({ cases, collectors }: { cases: CollectionCase[]; collectors: { id: string; name: string }[] }) {
  const t0 = today();
  const thisMonth = t0.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));
  const income = (c: CollectionCase): { on: string; amount: number }[] => {
    const out: { on: string; amount: number }[] = [];
    if ((c.status === 'PAID' || c.status === 'PARTIAL') && c.received_on) out.push({ on: c.received_on, amount: c.received_amount ?? 0 });
    if (c.legal_closed_on && c.legal_recovered_amount) out.push({ on: c.legal_closed_on, amount: c.legal_recovered_amount });
    return out;
  };
  const rows = collectors.map((p) => {
    const ins = cases.filter((c) => c.assigned_to === p.id).flatMap(income);
    const sum = (f: (on: string) => boolean) => ins.filter((x) => f(x.on)).reduce((s, x) => s + x.amount, 0);
    return {
      ...p,
      month: sum((on) => inPeriod(on, 'month', t0)),
      quarter: sum((on) => inPeriod(on, 'quarter', t0)),
      year: sum((on) => inPeriod(on, 'year', t0)),
      total: sum(() => true),
      byMonth: months.map((ym) => sum((on) => on.slice(0, 7) === ym)),
    };
  });
  const totals = { month: 0, quarter: 0, year: 0, total: 0 };
  for (const r of rows) {
    totals.month += r.month;
    totals.quarter += r.quarter;
    totals.year += r.year;
    totals.total += r.total;
  }
  const cell = (n: number) => (n ? ils(n) : '—');
  return (
    <Section title="💰 כמה גבתה כל מסלקת" hint="🔒 מנכ״ל ומנהלת חשבונות בלבד. כסף שנכנס בתיקים של המסלקת (תשלום + סיום תביעה משפטית), לפי תאריך הכניסה.">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] [&_td]:py-1.5 [&_th]:py-2 min-w-[620px]">
          <thead className="text-xs text-gray-700 bg-gray-100 sticky top-0 z-10">
            <tr>
              {['מסלקת', `החודש (${MONTHS[Number(thisMonth.slice(5)) - 1]})`, `הרבעון (Q${Math.ceil(Number(thisMonth.slice(5)) / 3)})`, `השנה (${thisMonth.slice(0, 4)})`, 'מאז ההתחלה'].map((h) => (
                <th key={h} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 [&>tr:nth-child(even)]:bg-gray-50/60">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                <td className="px-2 py-1.5 text-green-700 font-semibold">{cell(r.month)}</td>
                <td className="px-2 py-1.5">{cell(r.quarter)}</td>
                <td className="px-2 py-1.5">{cell(r.year)}</td>
                <td className="px-2 py-1.5 text-gray-600">{cell(r.total)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold">
              <td className="px-2 py-1.5">סה״כ</td>
              <td className="px-2 py-1.5">{cell(totals.month)}</td>
              <td className="px-2 py-1.5">{cell(totals.quarter)}</td>
              <td className="px-2 py-1.5">{cell(totals.year)}</td>
              <td className="px-2 py-1.5">{cell(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <p className="text-xs text-gray-500 mb-1">חודש אחר חודש (12 חודשים)</p>
        <table className="w-full text-xs min-w-[900px]">
          <thead className="text-gray-500 bg-gray-50">
            <tr>
              <th className="text-right font-semibold px-2 py-1.5">מסלקת</th>
              {months.map((ym) => (
                <th key={ym} className="text-right font-semibold px-2 py-1.5 whitespace-nowrap">{monthLabel(ym)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 [&>tr:nth-child(even)]:bg-gray-50/60">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{r.name}</td>
                {r.byMonth.map((v, i) => (
                  <td key={months[i]} className="px-2 py-1.5 whitespace-nowrap">{v ? ils(v) : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
