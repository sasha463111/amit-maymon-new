'use client';

import { useRef, useState } from 'react';
import type { DocItem } from '@/lib/customerDocs';
import { KitSign } from './KitSign';

type Consent = { title: string; intro: string; sections: { head: string; body: string[] }[]; checkbox: string };

async function post(fields: Record<string, string | Blob>): Promise<{ ok: boolean; error?: string }> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  try {
    const res = await fetch('/api/customer-docs', { method: 'POST', body: fd });
    return (await res.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: 'אין חיבור. בדוק/י את האינטרנט ונסה/י שוב.' };
  }
}

export function CustomerDocsForm(props: {
  token: string;
  name: string;
  plate: string | null;
  items: DocItem[];
  consent: Consent;
  consented: boolean;
  completed: boolean;
  initialUploaded: Record<string, number>;
  expiresAt: string;
  /** Claim kit to sign (stage 2) — null when the link carries none. */
  kit?: { docs: string[]; values: Record<string, string>; signed: string[] } | null;
}) {
  const [consented, setConsented] = useState(props.consented);
  const [agree, setAgree] = useState(false);
  const [uploaded, setUploaded] = useState<Record<string, number>>(props.initialUploaded);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(props.completed);
  const [sending, setSending] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const required = props.items.filter((i) => !i.optional);
  const missing = required.filter((i) => !uploaded[i.kind]);
  const total = Object.values(uploaded).reduce((a, b) => a + b, 0);

  async function accept() {
    setError(null);
    setSending(true);
    const r = await post({ token: props.token, action: 'consent', agree: 'yes' });
    setSending(false);
    if (r.ok) setConsented(true);
    else setError(r.error ?? 'שגיאה');
  }

  async function upload(kind: string, files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusyKind(kind);
    for (const file of Array.from(files)) {
      const r = await post({ token: props.token, action: 'upload', kind, file });
      if (!r.ok) {
        setError(r.error ?? 'שגיאה בהעלאה');
        break;
      }
      setUploaded((u) => ({ ...u, [kind]: (u[kind] ?? 0) + 1 }));
    }
    setBusyKind(null);
    const el = inputs.current[kind];
    if (el) el.value = '';
  }

  async function finish() {
    setSending(true);
    const r = await post({ token: props.token, action: 'done' });
    setSending(false);
    if (r.ok) setFinished(true);
    else setError(r.error ?? 'שגיאה');
  }

  const header = (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
      <div className="text-lg font-bold">{props.name ? `שלום ${props.name} 👋` : 'שלום 👋'}</div>
      {props.plate && <div className="text-sm text-gray-600 mt-0.5">רכב מס׳ {props.plate}</div>}
    </div>
  );

  if (finished) {
    return (
      <>
        {header}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-bold text-green-800">תודה! המסמכים התקבלו.</div>
          <p className="text-sm text-green-800 mt-1">נמשיך לטפל מול חברת הביטוח ונעדכן אותך.</p>
          <button onClick={() => setFinished(false)} className="mt-4 text-sm text-green-800 underline">
            שכחתי משהו, להעלות עוד
          </button>
        </div>
      </>
    );
  }

  if (!consented) {
    return (
      <>
        {header}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm leading-6 space-y-3">
          <h1 className="font-bold text-base">{props.consent.title}</h1>
          <p>{props.consent.intro}</p>
          {props.consent.sections.map((s) => (
            <div key={s.head}>
              <div className="font-semibold">{s.head}</div>
              {s.body.length === 1 ? (
                <p>{s.body[0]}</p>
              ) : (
                <ul className="list-disc pr-5 space-y-1">
                  {s.body.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <label className="flex items-start gap-2 pt-2 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 w-5 h-5 shrink-0" />
            <span className="font-semibold">{props.consent.checkbox}</span>
          </label>
          {error && <p className="text-red-600">{error}</p>}
          <button
            onClick={() => void accept()}
            disabled={!agree || sending}
            className="w-full h-12 rounded-xl bg-[#B03C2F] text-white font-bold disabled:opacity-40"
          >
            {sending ? '...' : 'המשך להעלאת מסמכים'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {props.kit && <KitSign token={props.token} docs={props.kit.docs} initialValues={props.kit.values} initialSigned={props.kit.signed} />}
      <p className="text-sm text-gray-600 mb-3">צלם/י או העלה/י כל מסמך. מסמך שהתקבל יסומן ב-✓.</p>
      <div className="space-y-2">
        {props.items.map((item) => {
          const n = uploaded[item.kind] ?? 0;
          const busy = busyKind === item.kind;
          return (
            <div key={item.kind} className={`bg-white rounded-2xl border p-3 flex items-center gap-3 ${n ? 'border-green-300' : 'border-gray-200'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${n ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {n ? '✓' : ''}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {item.label}
                  {item.optional && <span className="text-xs text-gray-400 font-normal"> (רשות)</span>}
                </div>
                {(item.hint || n > 0) && (
                  <div className="text-xs text-gray-500">
                    {item.hint}
                    {item.hint && n > 0 ? ' · ' : ''}
                    {n > 0 ? `${n} ${n === 1 ? 'קובץ' : 'קבצים'} התקבלו` : ''}
                  </div>
                )}
              </div>
              <input
                ref={(el) => {
                  inputs.current[item.kind] = el;
                }}
                type="file"
                accept="image/*,application/pdf"
                multiple={!!item.multi}
                className="hidden"
                onChange={(e) => void upload(item.kind, e.target.files)}
              />
              <button
                onClick={() => inputs.current[item.kind]?.click()}
                disabled={!!busyKind}
                className="h-10 px-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
              >
                {busy ? 'מעלה…' : n ? '📷 עוד' : '📷 צלם / העלה'}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <button
        onClick={() => void finish()}
        disabled={total === 0 || sending || !!busyKind}
        className="w-full h-12 rounded-xl bg-[#B03C2F] text-white font-bold mt-4 disabled:opacity-40"
      >
        {sending ? '...' : missing.length ? `סיימתי (חסרים ${missing.length})` : 'סיימתי — שלח'}
      </button>
      <p className="text-[11px] text-gray-400 text-center mt-3">
        הקישור אישי ובתוקף עד {new Date(props.expiresAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </p>
    </>
  );
}
