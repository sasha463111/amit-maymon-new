import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { listLoaners } from '@/app/actions/loaners';
import { loanerDocuments, canUseLoaners } from '@/lib/loaners';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

// The signed replacement-car agreement — printable / save as PDF.
export default async function LoanerAgreementPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!canUseLoaners((prof as { role: string } | null)?.role)) redirect('/');
  const { handovers } = await listLoaners();
  const h = handovers.find((x) => x.id === params.id);
  if (!h || !h.signature_url) notFound();
  const docs = loanerDocuments({
    branchName: h.branch_name,
    customerName: h.customer_name,
    customerPlate: h.customer_plate,
    loanerPlate: h.loaner_plate,
    loanerType: h.loaner_type,
    givenAt: h.given_at,
    kmOut: h.km_out,
    fuelOut: h.fuel_out,
    driver: h.driver,
  });
  const signedAt = h.agreement_signed_at
    ? new Date(h.agreement_signed_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-gray-200 space-y-3 text-sm leading-7 print:border-0 print:p-0" dir="rtl">
      <div className="flex justify-between items-center print:hidden">
        <span className="text-xs text-gray-500">הסכם חתום</span>
        <PrintButton />
      </div>
      {[docs.agreement, docs.declaration].map((d, i) => (
        <section key={d.title} className={`space-y-2 ${i ? 'pt-4 border-t border-gray-300 print:break-before-page' : ''}`}>
          <h1 className="text-xl font-bold text-center">{d.title}</h1>
          <p>{d.intro}</p>
          <ol className="list-decimal pr-5 space-y-1">
            {d.clauses.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          {i === 0 && h.notes && (
            <p>
              <b>הערות במסירה: </b>
              {h.notes}
            </p>
          )}
        </section>
      ))}
      <p className="font-semibold pt-2">{docs.confirmation}</p>
      <div className="pt-2 space-y-1">
        <p>
          <b>שם הלקוח: </b>
          {h.customer_name ?? ''}
        </p>
        <p>
          <b>נחתם: </b>
          {signedAt}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={h.signature_url} alt="חתימת הלקוח" className="h-24 w-auto border-b border-gray-400" />
      </div>
    </div>
  );
}
