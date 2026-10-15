'use client';

import { useEffect, useState } from 'react';

// "📠 סריקה לתיק" (Sapir, 15/10 — like BAFI): scans straight from the office
// scanner into the claim. A browser can't reach a USB scanner, so a small bridge
// runs on the PC (tools/scan-bridge) on 127.0.0.1; the button shows only where it runs.
const BRIDGE = 'http://127.0.0.1:47615';
const MAX = 4 * 1024 * 1024;

export function ScanToCase({ onSave, fileName, disabled }: { onSave: (pdf: File) => Promise<boolean>; fileName: string; disabled?: boolean }) {
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<'feeder' | 'duplex' | 'glass'>('feeder');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    fetch(`${BRIDGE}/health`, { signal: ctl.signal })
      .then((r) => r.ok && setReady(true))
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => ctl.abort();
  }, []);

  if (!ready) return null;

  async function scan() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`${BRIDGE}/scan?source=${source}&color=bw`, { method: 'POST' });
      if (!r.ok) throw new Error('scan');
      const blob = await r.blob();
      if (blob.size > MAX) {
        setErr('הסריקה גדולה מ-4MB — לסרוק פחות דפים בכל פעם.');
      } else {
        await onSave(new File([blob], fileName, { type: 'application/pdf' }));
      }
    } catch {
      setErr('הסריקה נכשלה — לבדוק שיש דפים בסורק ושהוא דלוק, ולנסות שוב.');
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button type="button" disabled={busy || disabled} onClick={() => void scan()} className="inline-flex items-center h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
        {busy ? 'סורק…' : '📠 סריקה לתיק'}
      </button>
      <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} disabled={busy} className="h-11 px-2 rounded-xl border border-gray-300 text-sm bg-white">
        <option value="feeder">מזין — צד אחד</option>
        <option value="duplex">מזין — דו-צדדי</option>
        <option value="glass">משטח זכוכית</option>
      </select>
      {err && <span className="text-sm text-red-700 w-full">⚠️ {err}</span>}
    </span>
  );
}
