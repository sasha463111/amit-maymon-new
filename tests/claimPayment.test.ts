import { describe, expect, test } from 'vitest';
import { daysLate, expectedPayment, netDue, payDateByRule, payerOf, workingDaysBetween, type PaymentRule } from '@/lib/collections';
import { financeDefaultsFromSubType, normalizeAppraiser } from '@/lib/finance';

// #42 — "תשלום תביעה": when the insurer is expected to pay, how late it is, and
// how much it owes. These rules decide what the collectors chase.

const monthly = (over: Partial<PaymentRule> = {}): PaymentRule => ({ insurer: 'הפניקס', agreement: null, mode: 'MONTHLY', offset_months: 2, pay_day: 10, cutoff_day: null, notes: null, ...over });

describe('payDateByRule', () => {
  test('monthly: N months after the approval month, on the pay day', () => {
    expect(payDateByRule('2026-10-10', monthly())).toBe('2026-12-10');
  });
  test('monthly: an approval after the cut-off day moves one more month (and across the year)', () => {
    expect(payDateByRule('2026-10-25', monthly({ cutoff_day: 25 }))).toBe('2026-12-10');
    expect(payDateByRule('2026-10-26', monthly({ cutoff_day: 25 }))).toBe('2027-01-10');
  });
  test('monthly: pay day 31 = the last day of a short month', () => {
    expect(payDateByRule('2026-12-05', monthly({ pay_day: 31 }))).toBe('2027-02-28');
    expect(payDateByRule('2027-12-05', monthly({ pay_day: 31 }))).toBe('2028-02-29');
  });
  test('biweekly: the 15th, else the end of the month', () => {
    const b = monthly({ mode: 'BIWEEKLY' });
    expect(payDateByRule('2026-10-15', b)).toBe('2026-10-15');
    expect(payDateByRule('2026-10-16', b)).toBe('2026-10-31');
    expect(payDateByRule('2028-02-20', b)).toBe('2028-02-29');
  });
  test('an incomplete agreement gives no date', () => {
    expect(payDateByRule('2026-10-10', monthly({ pay_day: null }))).toBeNull();
    expect(payDateByRule('2026-10-10', monthly({ offset_months: null }))).toBeNull();
  });
});

describe('expectedPayment', () => {
  const rules = { הפניקס: monthly(), 'מוקד ש.י.ר': monthly({ insurer: 'מוקד ש.י.ר', basis: 'INVOICE', offset_months: 1, pay_day: 31, cutoff_day: 10, agreement: 'ש.י.ר' }) };
  const base = { work_source: 'DIRECT', insurer: 'הפניקס', claim_type: 'פוליסה', claim_check_due_date: null, payment_approved_on: null };

  test('policy: waits for the payment approval, then follows the agreement', () => {
    expect(expectedPayment(base, rules)).toEqual({ date: null, basis: 'ממתין לאישור תשלום' });
    expect(expectedPayment({ ...base, payment_approved_on: '2026-10-10' }, rules).date).toBe('2026-12-10');
  });
  test('policy without an agreement says so (no invented date)', () => {
    const r = expectedPayment({ ...base, insurer: 'כלל', payment_approved_on: '2026-10-10' }, rules);
    expect(r.date).toBeNull();
    expect(r.basis).toContain('אין הסכם תשלום');
  });
  test("third party: the cheque's due date, else the approval date", () => {
    const tp = { ...base, claim_type: "צד ג'" };
    expect(expectedPayment({ ...tp, claim_check_due_date: '2026-11-01', payment_approved_on: '2026-10-01' }, rules).date).toBe('2026-11-01');
    expect(expectedPayment({ ...tp, payment_approved_on: '2026-10-01' }, rules).date).toBe('2026-10-01');
    expect(expectedPayment(tp, rules).date).toBeNull();
  });
  test('ש.י.ר: a monthly batch by the invoice (case closing) month — the cut-off does not apply', () => {
    const shir = { ...base, work_source: 'SHIR', insurer: null };
    expect(expectedPayment(shir, rules).date).toBeNull();
    expect(expectedPayment({ ...shir, case_closed_on: '2026-10-20' }, rules).date).toBe('2026-11-30');
  });
});

describe('payer, lateness, net amount', () => {
  test('payerOf: ש.י.ר and צה"ל are their own payers', () => {
    expect(payerOf({ work_source: 'SHIR', insurer: 'הפניקס' })).toBe('מוקד ש.י.ר');
    expect(payerOf({ work_source: 'IDF', insurer: null })).toBe('צה"ל');
    expect(payerOf({ work_source: 'DIRECT', insurer: ' כלל ' })).toBe('כלל');
  });
  test('working days skip Friday and Saturday', () => {
    expect(workingDaysBetween('2026-10-11', '2026-10-18')).toBe(5); // Sun → Sun
    expect(workingDaysBetween('2026-10-18', '2026-10-11')).toBe(0);
  });
  test('days late is never negative', () => {
    expect(daysLate('2026-10-10', '2026-10-15')).toBe(5);
    expect(daysLate('2026-10-10', '2026-10-01')).toBe(0);
    expect(daysLate(null, '2026-10-15')).toBe(0);
  });
  test('net due = invoice − VAT offset − reinstatement − offset', () => {
    expect(netDue({ amount_due: 10000, vat_offset: 1500, reinstatement: 300, offset_amount: 200 })).toBe(8000);
    expect(netDue({ amount_due: null, vat_offset: null, reinstatement: null, offset_amount: null })).toBe(0);
  });
  test('finance defaults from the sub claim type', () => {
    expect(financeDefaultsFromSubType('SHLOMO_THIRD_PARTY')).toEqual({ workSource: 'SHIR', claimType: "צד ג'" });
    expect(financeDefaultsFromSubType('MILITARY').workSource).toBe('IDF');
    expect(financeDefaultsFromSubType(null)).toEqual({ workSource: 'DIRECT', claimType: '' });
  });
  test('appraiser names are unified', () => {
    expect(normalizeAppraiser('כ.מ שמאות')).toBe('בר כ.מ');
    expect(normalizeAppraiser('  מתן   יעקבי ')).toBe('מתן יעקובי');
  });
});
