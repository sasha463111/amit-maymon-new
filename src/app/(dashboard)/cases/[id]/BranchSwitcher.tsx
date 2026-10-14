'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMoveTargets, moveCaseToBranch } from '@/app/actions/caseBranch';

/** "סניף: נתיבות · ⇄ העבר סניף" — move a case to the branch that repairs it (Amit, 2026-10-14). */
export function BranchSwitcher({ caseId, branchName }: { caseId: string; branchName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setErr(null);
    setOpen(true);
    if (!targets) setTargets(await getMoveTargets());
  }

  async function move(id: string, name: string) {
    if (!window.confirm(`להעביר את התיק לסניף ${name}?`)) return;
    setBusy(true);
    setErr(null);
    const res = await moveCaseToBranch(caseId, id);
    setBusy(false);
    if ('error' in res && res.error) return setErr(res.error);
    setOpen(false);
    router.refresh();
  }

  const others = (targets ?? []).filter((b) => b.name !== branchName);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{branchName}</span>
      {!open ? (
        <button type="button" onClick={() => void start()} className="text-xs font-semibold text-blue-700 hover:underline">
          ⇄ העבר סניף
        </button>
      ) : targets === null ? (
        <span className="text-xs text-gray-400">טוען…</span>
      ) : others.length === 0 ? (
        <span className="text-xs text-gray-500">אין סניף אחר זמין</span>
      ) : (
        <>
          {others.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={() => void move(b.id, b.name)}
              className="px-2.5 py-1 rounded-md border border-blue-300 bg-blue-50 text-blue-800 text-xs font-bold disabled:opacity-50"
            >
              {busy ? 'מעביר…' : `העבר ל${b.name}`}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500">ביטול</button>
        </>
      )}
      {err && <span className="text-xs text-red-700 w-full">⚠️ {err}</span>}
    </span>
  );
}
