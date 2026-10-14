import type { Metadata } from 'next';
import { loanerByShareToken } from '@/lib/loanerShare.server';
import { LoanerDocsView } from '@/components/LoanerDocsView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'מרכז שירות תהילה — רכב חליפי',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// The customer's copy of the signed replacement-car documents (Amit, 14/10:
// "שלא יהיה מצב שלא ידעתי לא הבנתי"). Personal link, read-only, time-limited.
export default async function LoanerCopyPage({ params }: { params: { token: string } }) {
  const r = await loanerByShareToken(params.token);
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-10 w-auto" />
          <div>
            <div className="font-bold text-gray-900">מרכז שירות תהילה</div>
            <div className="text-xs text-gray-500">עותק המסמכים שנחתמו — רכב חליפי</div>
          </div>
        </div>
        {r ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <LoanerDocsView h={r.handover} signatureUrl={r.signatureUrl} returnSignatureUrl={r.returnSignatureUrl} />
          </div>
        ) : (
          <p className="text-center text-gray-700 py-10">הקישור לא תקין או שפג תוקפו. לעותק חדש — פנו אלינו.</p>
        )}
      </div>
    </main>
  );
}
