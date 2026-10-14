'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCollectionCase, type CollectionCase } from '@/app/actions/collections';
import { addCaseEvent } from '@/app/actions/collectionFile';
import { formatDate } from '@/lib/dates';

// WhatsApp to the customer for a missing document (Amit approved, 14/10):
// tick what's missing, the message opens ready in WhatsApp, the request is
// logged in "טיפול שוטף", and the stage can move to "ממתין למסמכים מהלקוח"
// (its automatic reminder: check in 3 days).

const DOCS = [
  'תעודת זהות (כולל ספח)',
  'רישיון נהיגה (שני הצדדים)',
  'רישיון רכב',
  'פוליסת ביטוח',
  'טופס הודעה על תאונה',
  'פרטי חשבון בנק (צילום צ׳ק מבוטל)',
  'פרטי צד ג׳ (שם, טלפון, מספר רכב, חברת ביטוח)',
  'דוח משטרה / אישור הגשת תלונה',
  'תמונות הנזק',
];
const WAIT_STAGE = 'ממתין למסמכים מהלקוח';

function waPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('972') && d.length >= 11) return d;
  if (d.startsWith('0') && d.length >= 9) return `972${d.slice(1)}`;
  return null;
}

export function WhatsAppDocs({ c }: { c: CollectionCase }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(c.customer_phone ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [setStage, setSetStage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const items = [...picked, ...(extra.trim() ? [extra.trim()] : [])];
  const first = (c.customer_name ?? '').trim().split(/\s+/)[0] ?? '';
  const text = [
    `שלום${first ? ` ${first}` : ''}, כאן מחלקת הגבייה של מוסך תהילה${c.branch_name ? ` ${c.branch_name}` : ''}.`,
    `לגבי התביעה על רכב ${c.plate}${c.event_date ? ` (אירוע מ-${formatDate(c.event_date)})` : ''}${c.insurer ? ` מול ${c.insurer}` : ''}:`,
    'כדי שנוכל לקבל את התשלום מחברת הביטוח חסרים לנו:',
    ...items.map((x) => `• ${x}`),
    '',
    'אפשר לשלוח צילום ברור כאן בוואטסאפ. תודה רבה!',
  ].join('\n');

  async function send() {
    setErr(null);
    const to = waPhone(phone);
    if (!to) return setErr('מספר טלפון לא תקין');
    if (!items.length) return setErr('נא לסמן מה חסר');
    // Open first (a popup after an await is blocked on phones).
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank');
    setBusy(true);
    await addCaseEvent(c.id, { kind: 'NOTE', body: `💬 נשלחה ללקוח בקשת מסמכים בוואטסאפ (${phone}): ${items.join(', ')}` });
    if (setStage && c.claim_stage !== WAIT_STAGE) await updateCollectionCase(c.id, { claim_stage: WAIT_STAGE });
    if (!c.customer_phone && phone) await updateCollectionCase(c.id, { customer_phone: phone });
    setBusy(false);
    setOpen(false);
    setPicked([]);
    setExtra('');
    router.refresh();
  }

  const input = 'w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-10 px-4 rounded-xl border border-green-300 bg-green-50 text-green-800 text-sm font-semibold">
        💬 וואטסאפ ללקוח — מסמך חסר
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">💬 בקשת מסמכים מהלקוח</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 text-xl" aria-label="סגור">✕</button>
            </div>
            <label className="block text-xs text-gray-500">
              טלפון הלקוח
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" className={input} placeholder="05X-XXXXXXX" />
            </label>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">מה חסר?</p>
              {DOCS.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="w-5 h-5" checked={picked.includes(d)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d] : p.filter((x) => x !== d)))} />
                  {d}
                </label>
              ))}
              <label className="block text-xs text-gray-500 pt-1">
                אחר
                <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={150} className={input} placeholder="מסמך נוסף שחסר" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={setStage} onChange={(e) => setSetStage(e.target.checked)} />
              לעדכן מצב ל&quot;{WAIT_STAGE}&quot; (+ תזכורת אוטומטית בעוד 3 ימים)
            </label>
            <div className="rounded-lg bg-green-50 border border-green-200 p-2">
              <p className="text-[11px] text-gray-500 mb-1">ההודעה שתיפתח:</p>
              <p className="text-sm whitespace-pre-wrap">{text}</p>
            </div>
            {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
            <button type="button" disabled={busy} onClick={() => void send()} className="w-full h-11 rounded-xl bg-green-600 text-white font-bold disabled:opacity-50">
              {busy ? 'רושם בתיק…' : 'פתיחה בוואטסאפ'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
