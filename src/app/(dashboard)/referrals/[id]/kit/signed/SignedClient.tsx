'use client';

import Link from 'next/link';
import { kitDoc } from '@/lib/claimKit';
import { KitDocument, KitPage, KIT_PRINT_CSS, type KitValues } from '@/components/claimKit/KitPages';
import type { KitSigned } from '@/app/actions/customerDocLinks';

const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function SignedClient({ referralId, signed }: { referralId: string; signed: KitSigned[] }) {
  const docs = signed.filter((s) => kitDoc(s.docId));
  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <style>{`${KIT_PRINT_CSS} @media print { body * { visibility: hidden !important; } #kit-signed, #kit-signed * { visibility: visible !important; } #kit-signed { position: absolute; inset: 0; } }`}</style>
      <div className="print:hidden flex items-center justify-between gap-2 flex-wrap">
        <Link href={`/referrals/${referralId}/kit`} className="text-sm text-indigo-700 font-semibold">→ חזרה לקיט</Link>
        <h1 className="text-xl font-bold">✍️ מסמכים חתומים ({docs.length})</h1>
        <button type="button" onClick={() => window.print()} className="h-10 px-4 rounded-xl bg-gray-900 text-white font-bold">🖨️ הדפסה / PDF</button>
      </div>
      <div id="kit-signed" className="bg-gray-100 print:bg-white rounded-2xl print:rounded-none p-2 md:p-6 print:p-0 overflow-x-auto space-y-6 print:space-y-0">
        {docs.map((s, i) => (
          <KitPage key={s.docId} n={i + 1} total={docs.length}>
            <KitDocument
              doc={kitDoc(s.docId)!}
              values={s.values as KitValues}
              mode="signed"
              signature={s.signatureUrl}
              signedLine={`נחתם דיגיטלית ע״י הלקוח דרך קישור אישי · ${when(s.signedAt)}${s.ip ? ` · IP ${s.ip}` : ''} · גרסת נוסח ${s.version}`}
            />
          </KitPage>
        ))}
      </div>
    </div>
  );
}
