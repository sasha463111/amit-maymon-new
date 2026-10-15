'use client';

import { useEffect, useState } from 'react';
import type { Dashboards } from '@/lib/dashboards.server';
import { BranchFilter, DayBars, RankList, Section, StatCard, StatGrid, ils } from '@/components/ui/kit';

// "📊 דשבורדים" (Tomer, 15/10): returns · insurance claims · loaner cars ·
// repair cases — the same layout per module (stat cards → lists → 14 days),
// filtered by branch. Built on the shared kit (components/ui/kit.tsx).

type Tab = 'returns' | 'claims' | 'loaners' | 'cases';
const TABS: [Tab, string][] = [
  ['returns', '📦 החזרות'],
  ['claims', '🛡️ תביעות ביטוח'],
  ['loaners', '🚗 רכב חליפי'],
  ['cases', '🔧 תיקים'],
];

export function DashboardsClient({ data }: { data: Dashboards }) {
  const [tab, setTab] = useState<Tab>('returns');
  const [branch, setBranch] = useState('');
  useEffect(() => {
    try {
      const t = localStorage.getItem('dash-tab') as Tab | null;
      if (t && TABS.some(([k]) => k === t)) setTab(t);
    } catch {
      /* ignore */
    }
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem('dash-tab', t);
    } catch {
      /* ignore */
    }
  };
  const d = data.byBranch[branch] ?? data.byBranch[''];
  const updated = new Date(data.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 דשבורדים</h1>
          <p className="text-sm text-gray-500">תמונת מצב לכל מודול · עודכן {updated} · מרעננים את הדף לעדכון</p>
        </div>
        <BranchFilter branches={data.branches} value={branch} onChange={setBranch} />
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => choose(k)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'returns' && (
        <>
          <StatGrid>
            <StatCard label="ממתין לאיסוף" value={d.returns.waitingPickup} hint={`${d.returns.pickupOver7} מעל 7 ימים · ${d.returns.pickupOver14} מעל 14`} tone={d.returns.pickupOver14 ? 'bad' : d.returns.pickupOver7 ? 'warn' : 'neutral'} href="/returns" />
            <StatCard label="נאסף — ממתין לזיכוי" value={d.returns.waitingCredit} hint={`${d.returns.creditOver14} מעל 14 ימים מהאיסוף`} tone={d.returns.creditOver14 ? 'warn' : 'neutral'} href="/returns" />
            <StatCard label="זוכו החודש" value={d.returns.creditedMonth} hint={ils(d.returns.creditedMonthSum)} tone="good" />
            <StatCard label="היום — סומנו להחזרה" value={d.returns.today.marked} hint={`${d.returns.today.collected} נאספו · ${d.returns.today.credited} זוכו`} tone="info" />
          </StatGrid>
          <div className="grid md:grid-cols-2 gap-3">
            <Section title="ספקים עם הכי הרבה פתוחים (איסוף + זיכוי)">
              <RankList items={d.returns.suppliers} empty="אין חלקים פתוחים" />
            </Section>
            <Section title="חלקים שסומנו להחזרה — 14 ימים">
              <DayBars days={d.returns.daily} label="חלקים ביום" />
            </Section>
          </div>
        </>
      )}

      {tab === 'claims' && (
        <>
          <StatGrid>
            <StatCard label="תביעות פתוחות" value={d.claims.open} hint={`לגבייה ${ils(d.claims.toCollect)}`} href="/collections" />
            <StatCard label="עבר מועד פירעון הצ׳ק" value={d.claims.overdue} hint={ils(d.claims.overdueSum)} tone={d.claims.overdue ? 'bad' : 'good'} href="/collections" />
            <StatCard label="שולמו החודש" value={d.claims.paidMonth} hint={ils(d.claims.paidMonthSum)} tone="good" />
            <StatCard label="טיפול משפטי פתוח" value={d.claims.legal} hint={`${d.claims.updatesToday} עדכונים היום`} tone={d.claims.legal ? 'warn' : 'neutral'} href="/legal" />
          </StatGrid>
          <div className="grid md:grid-cols-2 gap-3">
            <Section title="תביעות פתוחות לפי שלב">
              <RankList items={d.claims.stages} />
            </Section>
            <Section title="תביעות פתוחות לפי מטפלת">
              <RankList items={d.claims.collectors} />
            </Section>
          </div>
          <Section title="עדכונים בתיקי התביעות — 14 ימים">
            <DayBars days={d.claims.daily} label="עדכונים ביום" />
          </Section>
        </>
      )}

      {tab === 'loaners' && (
        <>
          <StatGrid>
            <StatCard label="רכבים פעילים בצי" value={d.loaners.fleet} hint={`${d.loaners.free} פנויים · ${d.loaners.busy} אצל לקוחות`} href="/loaners" />
            <StatCard label="אצל לקוח מעל 7 ימים" value={d.loaners.outOver7} tone={d.loaners.outOver7 ? 'warn' : 'good'} href="/loaners" />
            <StatCard label="טסט נגמר בחודש הקרוב" value={d.loaners.testsDue} tone={d.loaners.testsDue ? 'bad' : 'good'} href="/loaners" />
            <StatCard label="השבוע — נמסרו" value={d.loaners.handedWeek} hint={`${d.loaners.returnedWeek} הוחזרו`} tone="info" />
          </StatGrid>
          <Section title="הכי הרבה ימים אצל לקוח">
            <RankList items={d.loaners.longest} empty="אין רכבים אצל לקוחות" format={(n) => `${n} ימים`} />
          </Section>
        </>
      )}

      {tab === 'cases' && (
        <>
          <StatGrid>
            <StatCard label="תיקים פתוחים" value={d.cases.open} hint={`ממוצע ${d.cases.avgOpenDays} ימים פתוח`} href="/cases" />
            <StatCard label="ממתינים לחלקים" value={d.cases.waitingParts} tone={d.cases.waitingParts ? 'warn' : 'neutral'} />
            <StatCard label="בעבודת פחחות" value={d.cases.inPainterWork} tone="info" href="/painters" />
            <StatCard label="השבוע — נפתחו" value={d.cases.new7} hint={`${d.cases.closed7} נסגרו · ${d.cases.referrals7} הפניות`} tone="good" />
          </StatGrid>
          <Section title="תיקים שנפתחו — 14 ימים">
            <DayBars days={d.cases.daily} label="תיקים ביום" />
          </Section>
        </>
      )}
    </div>
  );
}
