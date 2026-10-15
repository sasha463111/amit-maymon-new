import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { canSendCustomerLink, consentText, docItemsFor, firstName } from '@/lib/customerDocs';
import { suggestDocs, claimKindLabel } from '@/lib/claimKit';
import { KitClient } from './KitClient';
import { getKitStatus } from '@/app/actions/customerDocLinks';

export const dynamic = 'force-dynamic';

// "📄 קיט מסמכים" for a referral (Amit, 15/10, Discussion #4). Same gate as the
// customer link for now (CEO only until the lawyers approve the consent text).
export default async function ReferralKitPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!canSendCustomerLink((prof as { role: string } | null)?.role)) redirect(`/referrals/${params.id}`);
  const { data } = await supabase.from('referrals').select('id, customer_name, phone, plate_number, insurance_company, claim_type, case_id, branches(name)').eq('id', params.id).maybeSingle();
  type R = { id: string; customer_name: string | null; phone: string | null; plate_number: string | null; insurance_company: string | null; claim_type: string | null; case_id: string | null; branches: { name: string } | { name: string }[] | null };
  const r = data as R | null;
  if (!r) redirect('/referrals');
  // The repair case adds what the referral doesn't have (ID number, accident date, VAT answer).
  type CaseExtra = { customer_id_number: string | null; event_date: string | null; vat_status: string | null };
  let caseRow: CaseExtra | null = null;
  if (r.case_id) {
    const { data: c } = await supabase.from('cases').select('customer_id_number, event_date, vat_status').eq('id', r.case_id).maybeSingle();
    caseRow = c as CaseExtra | null;
  }
  const ilDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const branch = (Array.isArray(r.branches) ? r.branches[0] : r.branches)?.name ?? '';
  const status = await getKitStatus(r.id);
  return (
    <KitClient
      referralId={r.id}
      status={status}
      hasPhone={!!(r.phone ?? '').replace(/\D/g, '').match(/^(05\d{8}|9725\d{8})$/)}
      backHref={`/referrals/${r.id}`}
      suggested={suggestDocs({ claimType: r.claim_type, insurer: r.insurance_company })}
      initial={{
        date: ilDate(today),
        customer_name: r.customer_name ?? '',
        id_number: caseRow?.customer_id_number ?? '',
        plate: r.plate_number ?? '',
        insurer: r.insurance_company ?? '',
        garage: `מוסך תהילה בע״מ${branch ? ` — ${branch}` : ''}`,
        phone: r.phone ?? '',
        event_date: ilDate(caseRow?.event_date),
        vat_choice: caseRow?.vat_status === 'NONE' ? '1' : caseRow?.vat_status === 'DEALER' || caseRow?.vat_status === 'COMPANY' ? '2' : '',
      }}
      customer={{ name: firstName(r.customer_name), plate: r.plate_number, items: docItemsFor(r.claim_type), consent: consentText(r.plate_number) }}
      summary={[
        { label: 'לקוח', value: r.customer_name ?? '' },
        { label: 'רכב', value: r.plate_number ?? '' },
        { label: 'חברת ביטוח', value: r.insurance_company ?? '' },
        { label: 'סוג תביעה', value: claimKindLabel(r.claim_type, r.insurance_company) },
        { label: 'סניף', value: branch },
      ]}
    />
  );
}
