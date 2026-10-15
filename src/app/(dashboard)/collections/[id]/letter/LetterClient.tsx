'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateCollectionCase, type CollectionCase } from '@/app/actions/collections';
import { addCaseEvent } from '@/app/actions/collectionFile';
import { payerOf, THIRD_PARTY } from '@/lib/collections';
import { formatDate } from '@/lib/dates';
import { ils, toCollect, today } from '../../shared';

const SENT_STAGE = 'הוגשה דרישת תשלום';
// Each attachment ↔ the document types in the claim's "מסמכים" that prove it.
// Sapir 15/10: what was already scanned into the claim is ticked by itself.
const ATTACH: { name: string; labels: string[] }[] = [
  { name: 'חשבונית מס', labels: ['חשבונית'] },
  { name: 'דוח שמאי', labels: ['דוח שמאי'] },
  { name: 'טופס הודעה', labels: ['טופס הודעה'] },
  { name: 'אי הגשה', labels: ['אי הגשה'] },
  { name: 'עבר ביטוחי', labels: ['עבר ביטוחי'] },
  { name: 'תעודת זהות', labels: ['ת״ז', 'ת״ז / רישיון'] },
  { name: 'רישיון רכב', labels: ['רישיון רכב'] },
  { name: 'רישיון נהיגה', labels: ['רישיון נהיגה'] },
  { name: 'הסכמות למסירת מידע', labels: ['הסכמה למסירת מידע – נהג', 'הסכמה למסירת מידע – בעל הרכב'] },
  { name: 'אישור ניהול חשבון / המחאה', labels: ['אישור ניהול חשבון / צילום צ׳ק'] },
  { name: 'הסרת שיעבוד', labels: ['הסרת שיעבוד'] },
  { name: 'אישור רואה חשבון', labels: ['אישור רו״ח'] },
  { name: 'כתב הרשאה / המחאת זכות', labels: [] },
  { name: 'תמונות הנזק', labels: ['תמונות'] },
];

export function LetterClient({ c, senderName, docLabels = [] }: { c: CollectionCase; senderName: string; docLabels?: string[] }) {
  const inCase = (a: (typeof ATTACH)[number]) => a.labels.some((l) => docLabels.includes(l));
  const router = useRouter();
  const tp = c.claim_type === THIRD_PARTY;
  const [to, setTo] = useState((tp ? c.tp_insurer : null) || payerOf(c));
  const [handler, setHandler] = useState(c.insurer_handler ?? '');
  const [email, setEmail] = useState(c.insurer_handler_email ?? '');
  const [days, setDays] = useState('14');
  const [sender, setSender] = useState(senderName);
  const [phone, setPhone] = useState('');
  const [extra, setExtra] = useState('');
  const [attach, setAttach] = useState<string[]>(() => {
    const scanned = ATTACH.filter(inCase).map((a) => a.name);
    return scanned.length ? scanned : ['חשבונית מס', 'דוח שמאי'];
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const claimNo = (tp ? c.tp_claim_number : null) || c.claim_number;
  const amount = toCollect(c);
  const subject = `דרישת תשלום — רכב ${c.plate}${claimNo ? ` — תביעה ${claimNo}` : ''}`;
  const lines: [string, string | null][] = [
    ['מספר תביעה', claimNo],
    ['מספר רכב', c.plate],
    [tp ? 'בעל הרכב (הניזוק)' : 'המבוטח/ת', c.customer_name],
    ['תאריך האירוע', c.event_date ? formatDate(c.event_date) : null],
    ['מספר חשבונית', c.invoice_number],
    ['שמאי', c.appraiser_name],
    ['סכום החשבונית', c.amount_due != null ? ils(c.amount_due) : null],
    ['קיזוז מע״מ', c.vat_offset ? ils(c.vat_offset) : null],
    ['כינון', c.reinstatement ? ils(c.reinstatement) : null],
    ['סכום לתשלום', ils(amount)],
  ];
  const body = [
    `בהמשך לתיקון הרכב שבנדון במוסכנו${c.appraiser_name ? ` ולדוח השמאי ${c.appraiser_name}` : ''}, נבקש להעביר את התשלום בגין התביעה בסך ${ils(amount)} בתוך ${days} ימים ממועד מכתב זה.`,
    extra.trim(),
    attach.length ? `מצורפים: ${attach.join(', ')}.` : '',
    `לבירורים: ${sender}${phone ? `, טלפון ${phone}` : ''}, מחלקת גבייה.`,
  ].filter(Boolean);

  const mailText = [
    `לכבוד ${to}${handler ? `, לידי ${handler}` : ''}`,
    '',
    `הנדון: ${subject}`,
    '',
    ...lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    ...body,
    '',
    'בברכה,',
    sender,
    'מחלקת גבייה — מוסך תהילה בע"מ',
  ].join('\n');

  async function markSent() {
    setBusy(true);
    setMsg(null);
    await addCaseEvent(c.id, { kind: 'EMAIL', body: `📄 נשלחה דרישת תשלום ל${to}${handler ? ` (${handler})` : ''} — ${ils(amount)}, לתשלום בתוך ${days} ימים` });
    const r = c.claim_stage !== SENT_STAGE ? await updateCollectionCase(c.id, { claim_stage: SENT_STAGE }) : { ok: true as const };
    setBusy(false);
    if ('error' in r && r.error) return setMsg(`⚠️ ${r.error}`);
    setMsg('✓ נרשם בתיק · המצב עודכן ל"הוגשה דרישת תשלום" · תזכורת אוטומטית בעוד 14 ימים');
    router.refresh();
  }

  const input = 'w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white';
  const label = 'block text-xs text-gray-500';
  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <style>{`@media print { body * { visibility: hidden !important; } #demand-letter, #demand-letter * { visibility: visible !important; } #demand-letter { position: absolute; inset: 0; margin: 0; border: 0 !important; box-shadow: none !important; } @page { margin: 18mm; } }`}</style>
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <Link href={`/collections/${c.id}`} className="text-sm text-indigo-700 font-semibold">→ חזרה לתיק</Link>
        <h1 className="text-xl font-bold">📄 מכתב דרישת תשלום · רכב {c.plate}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <div className="space-y-2 print:hidden">
          <label className={label}>לכבוד (המשלם)<input value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
          <label className={label}>לידי (המטפל/ת)<input value={handler} onChange={(e) => setHandler(e.target.value)} className={input} /></label>
          <label className={label}>מייל המטפל/ת<input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={input} /></label>
          <label className={label}>תשלום בתוך (ימים)<input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className={input} /></label>
          <label className={label}>שם החותם/ת<input value={sender} onChange={(e) => setSender(e.target.value)} className={input} /></label>
          <label className={label}>טלפון לבירורים<input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={input} /></label>
          <label className={label}>פסקה נוספת (רשות)<textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" /></label>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">מצורפים — ✓ = כבר נסרק לתיק (מסומן לבד)</p>
            {ATTACH.map((a) => {
              const has = inCase(a);
              return (
                <label key={a.name} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="w-4 h-4" checked={attach.includes(a.name)} onChange={(e) => setAttach((p) => (e.target.checked ? [...p, a.name] : p.filter((x) => x !== a.name)))} />
                  <span className="flex-1">{a.name}</span>
                  {has ? <span className="text-[11px] font-semibold text-green-700">✓ בתיק</span> : a.labels.length > 0 && <span className="text-[11px] text-gray-400">חסר</span>}
                </label>
              );
            })}
          </div>
          <div className="space-y-2 pt-2">
            <button type="button" onClick={() => window.print()} className="w-full h-11 rounded-xl bg-gray-900 text-white font-bold">🖨️ הדפסה / שמירה כ-PDF</button>
            <a
              href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailText)}`}
              className="w-full h-11 rounded-xl border border-gray-300 bg-white font-bold inline-flex items-center justify-center"
            >
              📧 פתיחה במייל
            </a>
            <button type="button" disabled={busy} onClick={() => void markSent()} className="w-full h-11 rounded-xl bg-green-600 text-white font-bold disabled:opacity-50">
              {busy ? 'רושם…' : '✓ נשלח — לרשום בתיק'}
            </button>
            {msg && <p className="text-sm">{msg}</p>}
            <p className="text-[11px] text-gray-500">במייל: את החשבונית ואת דוח השמאי מצרפים מלשונית &quot;מסמכים&quot; בתיק (שמירה למחשב ← צירוף).</p>
          </div>
        </div>

        <div id="demand-letter" className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-[15px] leading-7 text-gray-900 space-y-4">
          <div className="flex justify-between items-start border-b-2 border-red-600 pb-3">
            <div>
              <p className="text-xl font-bold">מוסך תהילה בע&quot;מ</p>
              <p className="text-sm text-gray-600">ח.פ. 513539148{c.branch_name ? ` · סניף ${c.branch_name}` : ''}</p>
            </div>
            <p className="text-sm">תאריך: {formatDate(today())}</p>
          </div>
          <div>
            <p>לכבוד</p>
            <p className="font-semibold">{to || '—'}</p>
            {handler && <p>לידי: {handler}</p>}
          </div>
          <p className="font-bold underline">הנדון: {subject}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
            {lines.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-gray-600">{k}:</dt>
                <dd className={k === 'סכום לתשלום' ? 'font-bold' : ''}>{v}</dd>
              </div>
            ))}
          </dl>
          {body.map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">{p}</p>
          ))}
          <div className="pt-4">
            <p>בברכה,</p>
            <p className="font-semibold">{sender}</p>
            <p>מחלקת גבייה — מוסך תהילה בע&quot;מ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
