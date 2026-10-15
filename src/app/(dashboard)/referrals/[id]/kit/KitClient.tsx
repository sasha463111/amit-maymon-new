'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KIT_DOCS } from '@/lib/claimKit';
import { KitPages, type KitValues } from '@/components/claimKit/KitPages';
import { createCustomerDocLink, type KitLinkStatus } from '@/app/actions/customerDocLinks';
import { useRouter } from 'next/navigation';

// The kit screen (Amit, 15/10): pick the documents (the claim type suggests
// them), type into the pages, print / save as PDF — or send it to the customer
// to complete and sign on the phone (stage 2: the customer link, KitSign).

export function KitClient({ referralId, status, hasPhone, backHref, suggested, initial, summary }: { referralId: string; status: KitLinkStatus; hasPhone: boolean; backHref: string; suggested: string[]; initial: KitValues; summary: { label: string; value: string }[] }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ whatsapp: string | null; message: string } | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  async function sendToCustomer() {
    if (!window.confirm('לשלוח ללקוח קישור לחתימה על המסמכים המסומנים? (קישור קודם שנשלח בהפניה הזו יבוטל)')) return;
    setSending(true);
    setSendErr(null);
    const r = await createCustomerDocLink(referralId, { docs: selected, values });
    setSending(false);
    if (r.error !== null) return setSendErr(r.error);
    setSent({ whatsapp: r.whatsapp, message: r.message });
    if (r.whatsapp) window.open(r.whatsapp, '_blank');
    router.refresh();
  }
  const [selected, setSelected] = useState<string[]>(suggested);
  const [values, setValues] = useState<KitValues>(initial);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : KIT_DOCS.map((d) => d.id).filter((x) => x === id || s.includes(x))));

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <style>{`@media print { body * { visibility: hidden !important; } #claim-kit, #claim-kit * { visibility: visible !important; } #claim-kit { position: absolute; inset: 0; } }`}</style>
      <div className="print:hidden space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link href={backHref} className="text-sm text-indigo-700 font-semibold">→ חזרה להפניה</Link>
          <h1 className="text-xl font-bold">📄 קיט מסמכים</h1>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">אילו מסמכים בקיט? (סימנו לפי סוג התביעה — אפשר לשנות)</p>
          <div className="grid gap-1.5 md:grid-cols-2">
            {KIT_DOCS.map((d) => (
              <label key={d.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} className="mt-1 w-4 h-4" />
                <span>
                  <b>{d.title}</b>
                  {d.subtitle ? ` — ${d.subtitle}` : ''}
                  {suggested.includes(d.id) && <span className="text-green-700"> · מומלץ לתביעה הזו</span>}
                  <span className="block text-xs text-gray-500">{d.when}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap pt-2">
            <button type="button" onClick={() => window.print()} className="h-11 px-5 rounded-xl bg-gray-900 text-white font-bold">🖨️ הדפסה / שמירה כ-PDF</button>
            <button type="button" disabled={sending || !selected.length} onClick={() => void sendToCustomer()} className="h-11 px-5 rounded-xl bg-green-600 text-white font-bold disabled:opacity-40">
              {sending ? 'יוצר קישור…' : '📲 שליחה ללקוח לחתימה'}
            </button>
            <span className="text-xs text-gray-500 self-center">מקלידים ישר בתוך הדפים (השדות הכחולים). ערך שמוקלד פעם אחת מתמלא בכל המסמכים.</span>
          </div>
          {!hasPhone && <p className="text-xs text-amber-700">אין בהפניה נייד תקין — הקישור ייווצר, ותעתיקו את ההודעה ידנית.</p>}
          {sendErr && <p className="text-sm text-red-600">⚠️ {sendErr}</p>}
          {sent && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm space-y-2">
              <p className="font-bold text-green-800">✓ הקישור נוצר{sent.whatsapp ? ' ונפתח בוואטסאפ' : ''}. הלקוח יקבל את המסמכים לחתימה + העלאת מסמכים.</p>
              <button type="button" onClick={() => void navigator.clipboard.writeText(sent.message)} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold">📋 העתקת ההודעה</button>
            </div>
          )}
          {status && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
              <p className="font-semibold">
                ✍️ נשלח ללקוח ב-{new Date(status.sentAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · נחתמו {status.signed.length} מתוך {status.docs.length}
                {status.done ? ' ✅' : ''}
              </p>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {status.docs.map((d) => {
                  const sg = status.signed.find((x) => x.docId === d.id);
                  return <li key={d.id}>{sg ? '✓' : '○'} {d.title}{sg ? ` — נחתם ${new Date(sg.signedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</li>;
                })}
              </ul>
              {status.signed.length > 0 && (
                <Link href={`/referrals/${referralId}/kit/signed`} className="inline-block mt-1 text-indigo-700 font-semibold">📄 המסמכים החתומים — צפייה והדפסה ←</Link>
              )}
            </div>
          )}
        </div>
      </div>
      <div id="claim-kit" className="bg-gray-100 print:bg-white rounded-2xl print:rounded-none p-2 md:p-6 print:p-0 overflow-x-auto">
        <KitPages selected={selected} values={values} setValues={setValues} summary={summary} />
      </div>
    </div>
  );
}
