'use client';

import { useMemo, useState } from 'react';

export interface FinanceRow {
  id: string;
  closed_on: string;
  branch_id: string;
  plate: string | null;
  work_source: 'DIRECT' | 'SHIR' | 'IDF';
  insurer: string | null;
  claim_type: string | null;
  appraiser: string | null;
  amount_ours: number;
  amount_shir: number | null;
  review_note: string | null;
}

const SOURCE_LABEL: Record<FinanceRow['work_source'], string> = {
  DIRECT: 'הסדר ישיר תהילה',
  SHIR: 'מוקד ש.י.ר',
  IDF: 'צה"ל',
};
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

type PeriodKind = 'all' | 'month' | 'quarter' | 'half' | 'year';

function periodKey(date: string, kind: PeriodKind): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  switch (kind) {
    case 'month': return `${y}-${String(m).padStart(2, '0')}`;
    case 'quarter': return `${y}-Q${Math.ceil(m / 3)}`;
    case 'half': return `${y}-H${m <= 6 ? 1 : 2}`;
    case 'year': return y;
    default: return 'all';
  }
}

function periodLabel(key: string): string {
  if (key === 'all') return 'כל התקופה';
  const [y, p] = key.split('-');
  if (!p) return `שנת ${y}`;
  if (p.startsWith('Q')) return `רבעון ${p.slice(1)} · ${y}`;
  if (p.startsWith('H')) return `${p === 'H1' ? 'חציון ראשון' : 'חציון שני'} · ${y}`;
  return `${MONTHS[Number(p) - 1]} ${y}`;
}

const ils = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');

interface Group { key: string; count: number; total: number }

function groupBy(rows: FinanceRow[], keyOf: (r: FinanceRow) => string): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) ?? { key: k, count: 0, total: 0 };
    g.count += 1;
    g.total += r.amount_ours;
    m.set(k, g);
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}

function Breakdown({ title, groups, label = (k: string) => k }: { title: string; groups: Group[]; label?: (k: string) => string }) {
  const max = Math.max(1, ...groups.map((g) => g.total));
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-3">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      {groups.length === 0 ? (
        <p className="text-gray-400 text-sm">אין נתונים</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 text-right">
              <th className="font-normal py-1"></th>
              <th className="font-normal py-1 px-2">תיקים</th>
              <th className="font-normal py-1 px-2">סה״כ</th>
              <th className="font-normal py-1 px-2">ממוצע</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-t border-gray-100">
                <td className="py-1.5 w-[40%]">
                  <div className="truncate">{label(g.key)}</div>
                  <div className="h-1.5 mt-1 rounded bg-indigo-100">
                    <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${(g.total / max) * 100}%` }} />
                  </div>
                </td>
                <td className="px-2 whitespace-nowrap">{g.count}</td>
                <td className="px-2 whitespace-nowrap">{ils(g.total)}</td>
                <td className="px-2 whitespace-nowrap">{ils(g.total / g.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function FinanceClient({ rows, branches, error }: { rows: FinanceRow[]; branches: { id: string; name: string }[]; error: string | null }) {
  const [kind, setKind] = useState<PeriodKind>('all');
  const [period, setPeriod] = useState<string>('all');
  const [branch, setBranch] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [showRows, setShowRows] = useState(false);

  const branchName = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches]);

  const periods = useMemo(() => {
    if (kind === 'all') return ['all'];
    return Array.from(new Set(rows.map((r) => periodKey(r.closed_on, kind)))).sort().reverse();
  }, [rows, kind]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (kind === 'all' || periodKey(r.closed_on, kind) === period) &&
          (!branch || r.branch_id === branch) &&
          (!source || r.work_source === source),
      ),
    [rows, kind, period, branch, source],
  );

  const total = filtered.reduce((s, r) => s + r.amount_ours, 0);
  const shirRows = filtered.filter((r) => r.amount_shir != null);
  const shirGap = shirRows.reduce((s, r) => s + ((r.amount_shir ?? 0) - r.amount_ours), 0);
  const review = filtered.filter((r) => r.review_note);

  function changeKind(k: PeriodKind) {
    setKind(k);
    setPeriod(k === 'all' ? 'all' : periodKey(rows[0]?.closed_on ?? new Date().toISOString(), k));
  }

  const trendKind: PeriodKind = kind === 'all' || kind === 'year' ? 'month' : kind === 'half' ? 'quarter' : 'month';
  const trendRows = rows.filter((r) => (!branch || r.branch_id === branch) && (!source || r.work_source === source));
  const trend = groupBy(trendRows, (r) => periodKey(r.closed_on, trendKind)).sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">כספים</h1>
        <p className="text-sm text-gray-500">חשבוניות תיקים שנסגרו · סכומים כולל מע״מ ועם ההנחות · 🔒 מנכ״ל בלבד</p>
      </div>
      {error && <p className="text-red-600 text-sm">שגיאה בטעינה: {error}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'month', 'quarter', 'half', 'year'] as PeriodKind[]).map((k) => (
          <button
            key={k}
            onClick={() => changeKind(k)}
            className={`h-9 px-3 rounded-lg border text-sm ${kind === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}
          >
            {{ all: 'הכול', month: 'חודש', quarter: 'רבעון', half: 'חציון', year: 'שנה' }[k]}
          </button>
        ))}
        {kind !== 'all' && (
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
            {periods.map((p) => (
              <option key={p} value={p}>{periodLabel(p)}</option>
            ))}
          </select>
        )}
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
          <option value="">כל הסניפים</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
          <option value="">כל מקורות העבודה</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi label="סה״כ חשבוניות" value={ils(total)} />
        <Kpi label="תיקים" value={String(filtered.length)} />
        <Kpi label="ממוצע לתיק" value={filtered.length ? ils(total / filtered.length) : '—'} />
        <Kpi
          label="פער ש.י.ר (הנחות שנתנו)"
          value={shirRows.length ? ils(shirGap) : '—'}
          hint={shirRows.length ? `לפי ${shirRows.length} תיקים עם סכום ללא הנחות` : 'אין עדיין סכומים ללא הנחות'}
        />
      </div>

      <Breakdown title={`מגמה לפי ${trendKind === 'quarter' ? 'רבעון' : 'חודש'}`} groups={trend} label={periodLabel} />

      <div className="grid gap-3 md:grid-cols-2">
        <Breakdown title="לפי מקור עבודה" groups={groupBy(filtered, (r) => r.work_source)} label={(k) => SOURCE_LABEL[k as FinanceRow['work_source']] ?? k} />
        <Breakdown title="לפי סוג תביעה" groups={groupBy(filtered, (r) => r.claim_type ?? 'לא צוין')} />
        <Breakdown title="לפי חברת ביטוח (הסדר ישיר)" groups={groupBy(filtered.filter((r) => r.work_source !== 'SHIR'), (r) => r.insurer ?? 'לא צוין')} />
        <Breakdown title="לפי שמאי" groups={groupBy(filtered, (r) => r.appraiser ?? 'לא צוין')} />
        <Breakdown title="לפי סניף" groups={groupBy(filtered, (r) => branchName[r.branch_id] ?? '—')} />
        <Breakdown title="שמאי × סוג תביעה" groups={groupBy(filtered, (r) => `${r.appraiser ?? 'לא צוין'} · ${r.claim_type ?? '—'}`)} />
      </div>

      {review.length > 0 && (
        <section className="bg-amber-50 rounded-xl border border-amber-200 p-3">
          <h2 className="text-sm font-semibold mb-2">⚠️ לבירור ({review.length})</h2>
          <ul className="text-sm space-y-1">
            {review.map((r) => (
              <li key={r.id}>
                {r.plate} · {branchName[r.branch_id]} · {r.closed_on.split('-').reverse().join('/')} — {r.review_note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-3">
        <button onClick={() => setShowRows((v) => !v)} className="text-sm font-semibold text-indigo-700">
          {showRows ? '▲ הסתר' : '▼ הצג'} את כל השורות ({filtered.length})
        </button>
        {showRows && (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-400 text-right">
                  {['תאריך', 'רכב', 'סניף', 'מקור', 'חברת ביטוח', 'סוג תביעה', 'שמאי', 'סכום', 'ללא הנחות'].map((h) => (
                    <th key={h} className="font-normal px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{r.closed_on.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.plate}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{branchName[r.branch_id]}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{SOURCE_LABEL[r.work_source]}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.insurer ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.claim_type ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.appraiser ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ils(r.amount_ours)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.amount_shir == null ? '' : ils(r.amount_shir)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}
