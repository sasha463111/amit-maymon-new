'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { searchCases, type CaseHit } from '@/app/actions/search';
import { searchCollectionCases } from '@/app/actions/collections';
import { formatDate } from '@/lib/dates';
import { SCREEN_WORDS, actionsFor, matchesQuery } from '@/lib/quickActions';

type Claim = Awaited<ReturnType<typeof searchCollectionCases>>[number];
type NavLink = { label: string; href: string };

// One result list across the groups, so ↑↓ + Enter walk all of it.
type Item =
  | { kind: 'action'; key: string; label: string; icon: string; href: string }
  | { kind: 'screen'; key: string; label: string; href: string }
  | { kind: 'claim'; key: string; claim: Claim }
  | { kind: 'case'; key: string; hit: CaseHit };

const GROUP_LABEL: Record<Item['kind'], string> = { action: 'פעולות', screen: 'מסכים', claim: 'תביעות ביטוח', case: 'תיקים' };
const plainLabel = (label: string) => label.replace(/^[^A-Za-z0-9֐-׿]+\s*/, '');

/** 🔍 in the header, on every page (Ctrl+K): find a case by plate or customer
 *  name — and, since 16/10, a screen or an action ("החזר" → mark a part for
 *  return). Screens/actions come from the user's own menu, so they follow the
 *  role. Cases open through /go, so each role lands on its own case page. */
export function CaseSearch({ links = [] }: { links?: NavLink[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CaseHit[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const actions = useMemo(() => actionsFor(links), [links]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      // Ctrl+K / ⌘K opens the search from anywhere (16/10, design round).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Cases: search as you type, after a short pause; a slower older answer
  // never overwrites a newer one.
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

  const term = q.trim();
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    // Before typing: the actions this person can do — the shortcut list.
    const acts = term ? actions.filter((a) => matchesQuery(`${a.label} ${a.words}`, term)) : actions;
    for (const a of acts) out.push({ kind: 'action', key: `a:${a.href}`, label: a.label, icon: a.icon, href: a.href });
    if (term) {
      const seen = new Set<string>();
      for (const l of links) {
        if (seen.has(l.href)) continue;
        seen.add(l.href);
        if (matchesQuery(`${plainLabel(l.label)} ${SCREEN_WORDS[l.href] ?? ''}`, term)) out.push({ kind: 'screen', key: `s:${l.href}`, label: plainLabel(l.label), href: l.href });
      }
    }
    for (const c of claims) out.push({ kind: 'claim', key: `c:${c.id}`, claim: c });
    for (const h of hits) out.push({ kind: 'case', key: `h:${h.id}`, hit: h });
    return out;
  }, [term, actions, links, claims, hits]);

  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function close() {
    setOpen(false);
    setQ('');
  }
  function openItem(it: Item) {
    close();
    if (it.kind === 'action' || it.kind === 'screen') router.push(it.href);
    else if (it.kind === 'claim') router.push(`/collections/${it.claim.id}`);
    else router.push(`/go/${it.hit.id}`);
  }

  const row = (it: Item, i: number) => {
    const on = i === active;
    const base = `w-full text-right px-4 py-2.5 flex items-center justify-between gap-3 ${on ? 'bg-red-50' : 'hover:bg-gray-50'}`;
    const common = { type: 'button' as const, onClick: () => openItem(it), onMouseMove: () => setActive(i), className: base, 'data-active': on ? 'true' : undefined };
    if (it.kind === 'action')
      return (
        <button {...common}>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0" aria-hidden="true">{it.icon}</span>
            <span className="font-semibold text-gray-900 truncate">{it.label}</span>
          </span>
          {on && <kbd className="text-[11px] text-gray-500 border border-gray-300 rounded px-1.5 shrink-0" dir="ltr">Enter</kbd>}
        </button>
      );
    if (it.kind === 'screen')
      return (
        <button {...common}>
          <span className="text-gray-900 truncate">
            <span className="text-gray-400">מסך · </span>
            {it.label}
          </span>
          <span className="text-xs text-gray-400 shrink-0">מעבר ←</span>
        </button>
      );
    if (it.kind === 'claim') {
      const c = it.claim;
      return (
        <button {...common}>
          <span className="min-w-0">
            <span className="font-bold text-gray-900 tracking-wide">{c.plate}</span>
            {c.customer && <span className="text-gray-700"> · {c.customer}</span>}
            <span className="block text-xs text-gray-500 mt-0.5">
              תביעת ביטוח{c.stage ? ` · ${c.stage}` : ''}{c.openedAt ? ` · נפתח ${formatDate(c.openedAt)}` : ''}
            </span>
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.closed ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>{c.closed ? 'סגורה' : 'תביעה'}</span>
        </button>
      );
    }
    const h = it.hit;
    return (
      <button {...common}>
        <span className="min-w-0">
          <span className="font-bold text-gray-900 tracking-wide">{h.plate}</span>
          {h.vehicle && <span className="text-gray-600 text-sm" dir="auto"> · {h.vehicle}</span>}
          {h.customer && <span className="text-gray-700"> · {h.customer}</span>}
          <span className="block text-xs text-gray-500 mt-0.5">
            {h.branch ?? ''}
            {h.openedAt ? ` · נפתח ${formatDate(h.openedAt)}` : ''}
          </span>
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${h.closed ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700 border border-green-200'}`}>{h.closed ? 'סגור' : 'פתוח'}</span>
      </button>
    );
  };

  const caseSearchPending = term.length >= 2 && loading && hits.length === 0 && claims.length === 0;

  return (
    <>
      {/* Phone: an icon. Computer: a wide search field in the header (16/10). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tip="search"
        className="md:hidden w-10 h-10 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors flex items-center justify-center shrink-0"
        title="חיפוש"
        aria-label="חיפוש תיק, מסך או פעולה"
      >
        <Search size={18} className="text-gray-600" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tip="search"
        className="hidden md:flex flex-1 max-w-md h-10 items-center gap-2.5 px-3 rounded-xl border border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 text-gray-500 text-sm transition-colors"
        aria-label="חיפוש תיק, מסך או פעולה"
      >
        <Search size={17} className="shrink-0" />
        <span className="flex-1 text-start truncate">חיפוש תיק, מסך או פעולה</span>
        <kbd className="font-mono text-[11px] border border-gray-300 rounded px-1.5 py-px bg-white" dir="ltr">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-3 sm:pt-20" onClick={() => setOpen(false)} dir="rtl">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="חיפוש">
            <div className="flex items-center gap-2 px-4 border-b border-gray-200">
              <Search size={18} className="text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === 'Enter' && items[active]) {
                    e.preventDefault();
                    openItem(items[active]);
                  }
                }}
                inputMode="search"
                placeholder="מספר רכב, שם לקוח, מסך או פעולה…"
                aria-label="חיפוש"
                className="flex-1 min-w-0 h-14 outline-none text-base bg-transparent"
              />
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="סגור">
                <X size={18} />
              </button>
            </div>

            <div ref={listRef} className="max-h-[65vh] overflow-y-auto pb-1">
              {items.length > 0 &&
                items.map((it, i) => (
                  <div key={it.key}>
                    {(i === 0 || items[i - 1].kind !== it.kind) && <p className="px-4 pt-3 pb-1 text-xs font-bold text-gray-400">{GROUP_LABEL[it.kind]}</p>}
                    {row(it, i)}
                  </div>
                ))}
              {term.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">הקלידו מספר רכב, שם לקוח, שם מסך (״החזרות״) או פעולה (״רכב חליפי״)</p>}
              {term.length === 1 && items.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">לחיפוש תיק — לפחות 2 תווים</p>}
              {caseSearchPending && <p className="px-4 py-3 text-sm text-gray-400">מחפש תיקים…</p>}
              {term.length >= 2 && !loading && items.length === 0 &&
                (error ? <p className="px-4 py-6 text-sm text-red-600 text-center">⚠️ {error}</p> : <p className="px-4 py-6 text-sm text-gray-500 text-center">לא נמצא תיק, מסך או פעולה</p>)}
            </div>
            <div className="hidden md:flex gap-4 px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
              <span>↑↓ בחירה</span>
              <span>Enter פתיחה</span>
              <span>Esc סגירה</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
