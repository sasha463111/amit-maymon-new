import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { listLoaners } from '@/app/actions/loaners';
import { canUseLoaners } from '@/lib/loaners';
import { LoanerDocsView } from '@/components/LoanerDocsView';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

// The signed replacement-car documents — printable / save as PDF.
export default async function LoanerAgreementPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role, loaners_access').eq('id', user.id).maybeSingle();
  if (!canUseLoaners((prof as { role: string } | null)?.role, !!(prof as { loaners_access?: boolean } | null)?.loaners_access)) redirect('/');
  const { handovers } = await listLoaners();
  const h = handovers.find((x) => x.id === params.id);
  if (!h || !h.signature_url) notFound();
  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-gray-200 space-y-3 print:border-0 print:p-0" dir="rtl">
      <div className="flex justify-between items-center print:hidden">
        <span className="text-xs text-gray-500">המסמכים החתומים</span>
        <PrintButton />
      </div>
      <LoanerDocsView h={h} signatureUrl={h.signature_url} returnSignatureUrl={h.return_signature_url} />
    </div>
  );
}
