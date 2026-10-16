import type { Metadata } from 'next';
import { resolveToken, serviceClient } from '@/lib/customerDocLinks.server';
import { consentText, docItemsFor, firstName } from '@/lib/customerDocs';
import { CustomerDocsForm } from './CustomerDocsForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'מרכז שירות תהילה — העלאת מסמכים',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// Public page of the customer documents link (Amit, 2026-10-14). Shows only
// the customer's first name and plate; everything else stays on the server.
export default async function CustomerDocsPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const state = await resolveToken(params.token);

  if (!state.ok) {
    const text =
      state.reason === 'expired'
        ? 'תוקף הקישור פג. אפשר לבקש מאיתנו קישור חדש בהודעה חוזרת.'
        : state.reason === 'revoked'
          ? 'הקישור הזה כבר לא פעיל. אם קיבלת קישור חדש, השתמש/י בו.'
          : 'הקישור לא תקין. אם הגעת לכאן מהודעה שלנו, בקש/י קישור חדש.';
    return (
      <Shell>
        <p className="text-center text-gray-700 py-10">{text}</p>
      </Shell>
    );
  }

  const { link, referral } = state.value;
  if (!link.opened_at) {
    await serviceClient()
      ?.from('customer_doc_links')
      .update({ opened_at: new Date().toISOString() } as never)
      .eq('id', link.id)
      .is('opened_at', null);
  }

  // Which items already have a file from this link (after a reload).
  const { data: done } = await serviceClient()!
    .from('referral_documents')
    .select('doc_kind')
    .eq('via_link_id', link.id);
  const uploaded: Record<string, number> = {};
  for (const d of (done ?? []) as { doc_kind: string | null }[]) if (d.doc_kind) uploaded[d.doc_kind] = (uploaded[d.doc_kind] ?? 0) + 1;

  // Claim kit to sign (stage 2): which documents are already signed.
  let kit: { docs: string[]; values: Record<string, string>; signed: string[] } | null = null;
  if (link.kit_docs?.length) {
    const { data: sigs } = await serviceClient()!.from('kit_signatures').select('doc_id').eq('link_id', link.id);
    kit = { docs: link.kit_docs, values: link.kit_values ?? {}, signed: ((sigs ?? []) as { doc_id: string }[]).map((x) => x.doc_id) };
  }

  return (
    <Shell>
      <CustomerDocsForm
        token={params.token}
        name={firstName(referral.customer_name)}
        plate={referral.plate_number}
        items={docItemsFor(referral.claim_type)}
        consent={consentText(referral.plate_number)}
        consented={!!link.consent_at}
        completed={!!link.completed_at}
        initialUploaded={uploaded}
        expiresAt={link.expires_at}
        kit={kit}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-5">
        <div className="flex items-center gap-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-10 w-auto" />
          <div>
            <div className="font-bold text-gray-900">מרכז שירות תהילה</div>
            <div className="text-xs text-gray-500">העלאת מסמכים מאובטחת</div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
