'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { searchCases, type CaseHit } from '@/app/actions/search';
import { searchCollectionCases } from '@/app/actions/collections';
import { formatDate } from '@/lib/dates';

type Claim = Awaited<ReturnType<typeof searchCollectionCases>>[number];

/** 🔍 in the header, on every page: find a case by plate or customer name and
 *  open it (through /go, so each role lands on its own case page). */
export function CaseSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CaseHit[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Search as you type, after a short pause; a slower older answer never
  // overwrites a newer one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setClaims([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const [res, cl] = await Promise.all([
        searchCases(term).catch(() => ({ hits: [] as CaseHit[], error: 'שגיאה בחיפוש' })),
        searchCollectionCases(term).catch(() => [] as Claim[]),
      ]);
      if (id !== seq.current) return;
      setHits(res.hits);
      setClaims(cl);
      setError(res.error ?? null);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(hit: CaseHit) {
    setOpen(false);
    setQ('');
    router.push(`/go/${hit.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center shrink-0"
        title="חיפוש תיק"
        aria-label="חיפוש תיק"
      >
        <Search size={16} className="text-gray-600" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-3 sm:pt-20" onClick={() => setOpen(false)} dir="rtl">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 border-b border-gray-200">
              <Search size={18} className="text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (claims[0]) { setOpen(false); setQ(''); router.push(`/collections/${claims[0].id}`); }
                  else if (hits[0]) go(hits[0]);
                }}
                inputMode="search"
                placeholder="מספר רכב או שם לקוח…"
                className="flex-1 min-w-0 h-14 outline-none text-base bg-transparent"
              />
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="סגור">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">הקלידו לפחות 2 תווים — מספר רכב (גם חלקי) או שם לקוח</p>
              ) : loading && hits.length === 0 && claims.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">מחפש…</p>
              ) : hits.length === 0 && claims.length === 0 ? (
                error ? <p className="px-4 py-6 text-sm text-red-600 text-center">⚠️ {error}</p> : <p className="px-4 py-6 text-sm text-gray-500 text-center">לא נמצא תיק</p>
              ) : (
                <ul>
                  {claims.map((c) => (
                    <li key={`claim-${c.id}`}>
                      <button
                        type="button"
                        onClick={() => { setOpen(false); setQ(''); router.push(`/collections/${c.id}`); }}
                        className="w-full text-right px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="font-bold text-gray-900 tracking-wide">{c.plate}</span>
                          {c.customer && <span className="text-gray-700"> · {c.customer}</span>}
                          <span className="block text-xs text-gray-500 mt-0.5">
                            תביעת ביטוח{c.stage ? ` · ${c.stage}` : ''}{c.openedAt ? ` · נפתח ${formatDate(c.openedAt)}` : ''}
                          </span>
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.closed ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                          {c.closed ? 'סגורה' : 'תביעה'}
                        </span>
                      </button>
                    </li>
                  ))}
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => go(h)}
                        className="w-full text-right px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="font-bold text-gray-900 tracking-wide">{h.plate}</span>
                          {h.vehicle && <span className="text-gray-600 text-sm" dir="auto"> · {h.vehicle}</span>}
                          {h.customer && <span className="text-gray-700"> · {h.customer}</span>}
                          <span className="block text-xs text-gray-500 mt-0.5">
                            {h.branch ?? ''}
                            {h.openedAt ? ` · נפתח ${formatDate(h.openedAt)}` : ''}
                          </span>
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            h.closed ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                        >
                          {h.closed ? 'סגור' : 'פתוח'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
