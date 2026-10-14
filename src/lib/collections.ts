// Collections — expected payment date (Amit, 2026-10-14). Shared by the
// collections screen and anything that reports expected receipts.
//
// • פוליסה / הסדר ג' (anything that is not צד ג'): from the insurer's payment
//   approval date, by the garage's agreement with that insurer (Amit's sheet
//   "זמני תשלום חברות הביטוח בהסדר"):
//     MONTHLY  — N months after the approval month, on the payer's payment day
//                (31 = last day of the month); with a cut-off day, approvals
//                after it move one more month (AIG: after the 25th).
//     BIWEEKLY — the 15th or the end of the month, whichever comes first on or
//                after the approval date (Ayalon).
// • צד ג': the claims cheque due date (the approval date ≈ the day the money
//   arrives; the claim is paid within 90 days and can be earlier).
// A collector can always close a row by the actual payment date.

export const THIRD_PARTY = "צד ג'";

export type PaymentRule = {
  insurer: string;
  agreement: string | null;
  mode: 'MONTHLY' | 'BIWEEKLY';
  offset_months: number | null;
  pay_day: number | null;
  cutoff_day: number | null;
  notes: string | null;
};

/** Who pays: ש.י.ר and צה"ל are their own payers; otherwise the insurer. */
export function payerOf(r: { work_source: string; insurer: string | null }): string {
  if (r.work_source === 'SHIR') return 'מוקד ש.י.ר';
  if (r.work_source === 'IDF') return 'צה"ל';
  return (r.insurer ?? '').trim();
}

const lastDay = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const iso = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);

/** The payment date for an approval date under a rule; null when the rule is incomplete. */
export function payDateByRule(approvedIso: string, rule: PaymentRule): string | null {
  const [y, m, d] = approvedIso.split('-').map(Number);
  const m0 = m - 1;
  if (rule.mode === 'BIWEEKLY') {
    return d <= 15 ? iso(y, m0, 15) : iso(y, m0, lastDay(y, m0));
  }
  if (rule.offset_months == null || rule.pay_day == null) return null;
  const offset = rule.offset_months + (rule.cutoff_day != null && d > rule.cutoff_day ? 1 : 0);
  const ty = y + Math.floor((m0 + offset) / 12);
  const tm0 = (m0 + offset) % 12;
  return iso(ty, tm0, Math.min(rule.pay_day, lastDay(ty, tm0)));
}

export function ruleLabel(rule: PaymentRule): string {
  if (rule.mode === 'BIWEEKLY') return 'כל שבועיים (15 / סוף החודש)';
  if (rule.offset_months == null || rule.pay_day == null) return rule.agreement ?? '—';
  const day = rule.pay_day >= 31 ? 'סוף החודש' : `${rule.pay_day} לחודש`;
  const cut = rule.cutoff_day != null ? `, אחרי ${rule.cutoff_day} לחודש — חודש נוסף` : '';
  return `${rule.offset_months} חודשים אחרי חודש האישור, ב-${day}${cut}`;
}

export type Expected = { date: string | null; basis: string };

export function expectedPayment(
  r: { work_source: string; insurer: string | null; claim_type: string | null; claim_check_due_date: string | null; payment_approved_on: string | null },
  rules: Record<string, PaymentRule>,
): Expected {
  if (r.claim_type === THIRD_PARTY) {
    if (r.claim_check_due_date) return { date: r.claim_check_due_date, basis: 'מועד פירעון הצ׳ק' };
    if (r.payment_approved_on) return { date: r.payment_approved_on, basis: 'תאריך אישור התשלום' };
    return { date: null, basis: 'חסר מועד פירעון / אישור תשלום' };
  }
  if (!r.payment_approved_on) return { date: null, basis: 'ממתין לאישור תשלום' };
  const payer = payerOf(r);
  const rule = rules[payer];
  const date = rule ? payDateByRule(r.payment_approved_on, rule) : null;
  if (!date) return { date: null, basis: `אין הסכם תשלום ל${payer || 'חברה'}` };
  return { date, basis: rule.agreement || ruleLabel(rule) };
}

/** Payers that may need an agreement besides the insurers list. */
export const PAYERS_EXTRA = ['מוקד ש.י.ר', 'צה"ל'] as const;
