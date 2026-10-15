'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomerDocLink, revokeCustomerDocLink } from '@/app/actions/customerDocLinks';
import { CustomerPreview, type PreviewData } from './CustomerPreview';

export interface CustomerLinkRow {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  opened_at: string | null;
  consent_at: string | null;
  completed_at: string | null;
  kit_docs: string[] | null;
  kit_values: Record<string, string> | null;
  files: number;
  uploaded: Record<string, number>;
  signed: string[];
}

const fmt = (s: string) =>
  new Date(s).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "📲 קישור ללקוח" on a referral (Amit, 2026-10-14). */
export function CustomerLinkPanel({ referralId, latest, hasPhone, preview }: { referralId: string; latest: CustomerLinkRow | null; hasPhone: boolean; preview: PreviewData }) {
  const router = useRouter();
  const [showing, setShowing] = useState<'before' | 'sent' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ message: string; whatsapp: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const live = latest && !latest.revoked_at && new Date(latest.expires_at).getTime() > Date.now();
  const status = !latest
    ? null
    : latest.revoked_at
      ? 'בוטל'
      : !live
        ? 'פג תוקף'
        : latest.completed_at
          ? 'הלקוח סיים להעלות'
          : latest.consent_at
            ? 'הלקוח אישר ומעלה מסמכים'
            : latest.opened_at
              ? 'הלקוח פתח את הקישור'
              : 'נשלח, עוד לא נפתח';

  async function send() {
    setBusy(true);
    setError(null);
    setCopied(false);
    const r = await createCustomerDocLink(referralId);
    setBusy(false);
    if (r.error !== null) {
      setError(r.error);
      return;
    }
    setMade({ message: r.message, whatsapp: r.whatsapp });
    if (r.whatsapp) window.open(r.whatsapp, '_blank', 'noopener');
    router.refresh();
  }

  async function revoke() {
    if (!latest || !confirm('לבטל את הקישור? הלקוח לא יוכל להמשיך להעלות דרכו.')) return;
    setBusy(true);
    const r = await revokeCustomerDocLink(referralId, latest.id);
    setBusy(false);
    if (r.error) setError(r.error);
    setMade(null);
    router.refresh();
  }

  async function copy() {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.message);
      setCopied(true);
    } catch {
      setError('ההעתקה נכשלה — סמן/י את הטקסט והעתק/י ידנית');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">📲 קישור ללקוח להעלאת מסמכים <span className="text-xs text-gray-400 font-normal">🔒 פיילוט</span></h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowing('before')} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
            👁️ תצוגה מקדימה
          </button>
          {latest && (
            <button onClick={() => setShowing('sent')} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
              👁️ מה שנשלח
            </button>
          )}
          {live && (
            <button onClick={() => void revoke()} disabled={busy} className="h-9 px-3 rounded-lg border border-gray-300 text-sm disabled:opacity-50">
              בטל קישור
            </button>
          )}
          <button onClick={() => void send()} disabled={busy} className="h-9 px-3 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? '...' : latest ? '🔁 שלח קישור חדש' : '📲 שלח ללקוח קישור'}
          </button>
        </div>
      </div>

      {latest && (
        <div className="text-sm text-gray-700">
          <span className="font-semibold">{status}</span>
          <span className="text-gray-400"> · נשלח {fmt(latest.created_at)}</span>
          {live && <span className="text-gray-400"> · בתוקף עד {fmt(latest.expires_at)}</span>}
          {latest.files > 0 && <span className="text-green-700"> · {latest.files} קבצים התקבלו (מופיעים במסמכים למטה, אחרי רענון)</span>}
        </div>
      )}

      {!hasPhone && <p className="text-xs text-amber-700">אין בהפניה מספר נייד תקין, לכן וואטסאפ לא ייפתח אוטומטית. אפשר להעתיק את ההודעה ולשלוח ידנית.</p>}

      {made && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <pre className="whitespace-pre-wrap text-sm font-[inherit]">{made.message}</pre>
          <div className="flex gap-2 flex-wrap">
            {made.whatsapp && (
              <a href={made.whatsapp} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-lg bg-green-600 text-white text-sm font-semibold inline-flex items-center">
                פתח בוואטסאפ
              </a>
            )}
            <button onClick={() => void copy()} className="h-9 px-3 rounded-lg border border-gray-300 text-sm">
              {copied ? '✓ הועתק' : 'העתק הודעה'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">הקישור מוצג רק עכשיו ולא נשמר במערכת. אם צריך שוב — שולחים קישור חדש.</p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showing === 'before' && <CustomerPreview data={preview} kit={null} onClose={() => setShowing(null)} />}
      {showing === 'sent' && latest && (
        <CustomerPreview
          data={preview}
          kit={latest.kit_docs?.length ? { docs: latest.kit_docs, values: latest.kit_values ?? {}, signed: latest.signed } : null}
          uploaded={latest.uploaded}
          sent={{ consented: !!latest.consent_at, completed: !!latest.completed_at, expiresAt: latest.expires_at }}
          onClose={() => setShowing(null)}
        />
      )}
    </div>
  );
}
