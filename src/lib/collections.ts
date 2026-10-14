// Collections — expected payment date (Amit, 2026-10-14). Shared by the
// collections screen and anything that reports expected receipts.
//
// • פוליסה / הסדר ג' (and anything that is not צד ג'): from the insurer's
//   payment approval date, by the garage's agreement with that insurer —
//   "שוטף + N": end of the approval month + N days.
// • צד ג': the claims cheque due date (the claim is paid within 90 days and
//   can be paid earlier; the approval date is ~the day the money arrives).
// A collector can always close a row by the actual payment date.

export const THIRD_PARTY = "צד ג'";

/** Who pays: ש.י.ר and צה"ל are their own payers; otherwise the insurer. */
export function payerOf(r: { work_source: string; insurer: string | null }): string {
  if (r.work_source === 'SHIR') return 'מוקד ש.י.ר';
  if (r.work_source === 'IDF') return 'צה"ל';
  return (r.insurer ?? '').trim();
}

function endOfMonth(iso: string): Date {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
}

function addDays(d: Date, n: number): string {
  const x = new Date(d.getTime() + n * 86_400_000);
  return x.toISOString().slice(0, 10);
}

export type Expected = { date: string | null; basis: string };

export function expectedPayment(
  r: { work_source: string; insurer: string | null; claim_type: string | null; claim_check_due_date: string | null; payment_approved_on: string | null },
  terms: Record<string, number>,
): Expected {
  if (r.claim_type === THIRD_PARTY) {
    if (r.claim_check_due_date) return { date: r.claim_check_due_date, basis: 'מועד פירעון הצ׳ק' };
    if (r.payment_approved_on) return { date: r.payment_approved_on, basis: 'תאריך אישור התשלום' };
    return { date: null, basis: 'חסר מועד פירעון / אישור תשלום' };
  }
  if (!r.payment_approved_on) return { date: null, basis: 'ממתין לאישור תשלום' };
  const payer = payerOf(r);
  const n = terms[payer];
  if (n == null) return { date: null, basis: `אין הסכם תשלום ל${payer || 'חברה'}` };
  return { date: addDays(endOfMonth(r.payment_approved_on), n), basis: `שוטף + ${n}` };
}

/** Payers that may need terms (insurers + ש.י.ר). */
export const PAYERS_EXTRA = ['מוקד ש.י.ר', 'צה"ל'] as const;
