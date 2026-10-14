import { loanerDocuments } from '@/lib/loaners';
import type { Handover } from '@/app/actions/loaners';

// The signed replacement-car documents (agreement, driver's declaration,
// optional deductible waiver) + hand-over / return details and signatures.
// Used by the internal print page and by the customer's link (/l/[token]).

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function LoanerDocsView({ h, signatureUrl, returnSignatureUrl }: { h: Handover; signatureUrl: string | null; returnSignatureUrl: string | null }) {
  const docs = loanerDocuments({
    branchName: h.branch_name,
    customerName: h.customer_name,
    customerPlate: h.customer_plate,
    customerCarModel: h.customer_car_model,
    loanerPlate: h.loaner_plate,
    loanerType: h.loaner_type,
    givenAt: h.given_at,
    kmOut: h.km_out,
    fuelOut: h.fuel_out,
    driver: h.driver,
    waiver: h.waiver ? { from: h.waiver_from, to: h.waiver_to } : null,
  });
  const sections = [docs.agreement, docs.declaration, ...(docs.waiver ? [docs.waiver] : [])];
  return (
    <div className="space-y-4 text-sm leading-7">
      {sections.map((d, i) => (
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
      <p className="font-semibold">{docs.confirmation}</p>
      <div className="space-y-1">
        <p>
          <b>שם הלקוח: </b>
          {h.customer_name ?? ''}
        </p>
        <p>
          <b>נחתם: </b>
          {fmt(h.agreement_signed_at)}
        </p>
        {signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signatureUrl} alt="חתימת הלקוח" className="h-24 w-auto border-b border-gray-400" />
        )}
      </div>

      {h.returned_at && (
        <section className="pt-4 border-t border-gray-300 space-y-1">
          <h2 className="text-lg font-bold">החזרת הרכב החליפי</h2>
          <p>
            <b>מועד החזרה: </b>
            {fmt(h.returned_at)}
          </p>
          {h.km_in != null && (
            <p>
              <b>ק״מ בהחזרה: </b>
              {h.km_in.toLocaleString('he-IL')}
            </p>
          )}
          {h.fuel_in && (
            <p>
              <b>דלק בהחזרה: </b>
              {h.fuel_in}
            </p>
          )}
          {h.return_notes && (
            <p>
              <b>הערות: </b>
              {h.return_notes}
            </p>
          )}
          {returnSignatureUrl && (
            <>
              <p className="text-xs text-gray-500">חתימת הלקוח בהחזרה:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={returnSignatureUrl} alt="חתימת הלקוח בהחזרה" className="h-20 w-auto border-b border-gray-400" />
            </>
          )}
        </section>
      )}
    </div>
  );
}
