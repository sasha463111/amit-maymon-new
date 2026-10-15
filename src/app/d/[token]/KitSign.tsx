'use client';

import { useState } from 'react';
import { KitDocument, type KitValues } from '@/components/claimKit/KitPages';
import { SignaturePad } from '@/components/SignaturePad';
import { kitDoc } from '@/lib/claimKit';

// "✍️ טפסים לחתימה" on the customer link (claim kit, stage 2, 15/10): each
// document as text with our details filled in, fields to complete, and a
// finger signature. From the second document on — "אותה חתימה".

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export function KitSign({ token, docs, initialValues, initialSigned }: { token: string; docs: string[]; initialValues: KitValues; initialSigned: string[] }) {
  const [values, setValues] = useState<KitValues>(initialValues);
  const [signed, setSigned] = useState<string[]>(initialSigned);
  const [openId, setOpenId] = useState<string | null>(docs.find((d) => !initialSigned.includes(d)) ?? null);
  const [pad, setPad] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sign(docId: string, sigDataUrl: string) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('token', token);
    fd.append('action', 'kit-sign');
    fd.append('doc', docId);
    fd.append('values', JSON.stringify(values));
    fd.append('signature', new File([await dataUrlToBlob(sigDataUrl)], 'signature.png', { type: 'image/png' }));
    let ok = false;
    try {
      const res = await fetch('/api/customer-docs', { method: 'POST', body: fd });
      const j = (await res.json()) as { ok: boolean; error?: string };
      ok = j.ok;
      if (!ok) setErr(j.error ?? 'שגיאה');
    } catch {
      setErr('אין חיבור. בדוק/י את האינטרנט ונסה/י שוב.');
    }
    setBusy(false);
    if (!ok) return;
    const next = [...signed, docId];
    setSigned(next);
    setLastSig(sigDataUrl);
    setPad(null);
    setOpenId(docs.find((d) => !next.includes(d)) ?? null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const left = docs.filter((d) => !signed.includes(d)).length;
  return (
    <div className="space-y-2 mb-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="font-bold">✍️ טפסים לחתימה</div>
        <p className="text-sm text-gray-600 mt-0.5">
          {left ? `נשארו ${left} מתוך ${docs.length}. קוראים, משלימים מה שחסר (השדות הכחולים) וחותמים באצבע.` : '✅ חתמת על כל הטפסים — תודה!'}
        </p>
      </div>
      {docs.map((id) => {
        const doc = kitDoc(id);
        if (!doc) return null;
        const isSigned = signed.includes(id);
        const isOpen = openId === id && !isSigned;
        return (
          <div key={id} className={`bg-white rounded-2xl border ${isSigned ? 'border-green-300' : 'border-gray-200'}`}>
            <button type="button" onClick={() => !isSigned && setOpenId(isOpen ? null : id)} className="w-full p-3 flex items-center gap-3 text-right">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSigned ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{isSigned ? '✓' : '✍️'}</span>
              <span className="flex-1 font-semibold">
                {doc.title}
                {doc.subtitle && <span className="block text-xs text-gray-500 font-normal">{doc.subtitle}</span>}
              </span>
              {!isSigned && <span className="text-xs text-gray-400">{isOpen ? 'סגירה' : 'לקריאה וחתימה'}</span>}
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 p-3 space-y-3">
                <div className="rounded-xl border border-gray-200 p-3 overflow-x-auto text-sm">
                  <KitDocument doc={doc} values={values} setValues={setValues} mode="customer" />
                </div>
                {lastSig ? (
                  <div className="space-y-2">
                    <button type="button" disabled={busy} onClick={() => void sign(id, lastSig)} className="w-full h-12 rounded-xl bg-[#B03C2F] text-white font-bold disabled:opacity-40">
                      {busy ? 'שומר…' : '✍️ לחתום באותה חתימה'}
                    </button>
                    <details className="text-sm">
                      <summary className="text-gray-600 cursor-pointer">או לחתום מחדש</summary>
                      <div className="pt-2 space-y-2">
                        <SignaturePad onChange={setPad} height={160} />
                        <button type="button" disabled={busy || !pad} onClick={() => pad && void sign(id, pad)} className="w-full h-11 rounded-xl border border-gray-300 font-bold disabled:opacity-40">
                          חתימה חדשה ושליחה
                        </button>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">חתימה באצבע:</p>
                    <SignaturePad onChange={setPad} height={160} />
                    <button type="button" disabled={busy || !pad} onClick={() => pad && void sign(id, pad)} className="w-full h-12 rounded-xl bg-[#B03C2F] text-white font-bold disabled:opacity-40">
                      {busy ? 'שומר…' : 'חתימה ושליחה'}
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-gray-500">בלחיצה על &quot;חתימה&quot; אני מאשר/ת שקראתי את המסמך, שהפרטים בו נכונים, ושזו חתימתי.</p>
              </div>
            )}
          </div>
        );
      })}
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </div>
  );
}
