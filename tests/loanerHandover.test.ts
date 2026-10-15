import { describe, expect, test } from 'vitest';
import { FUEL_LEVELS, LOANER_ROLES, canUseLoaners, loanerDocuments, waiverCost } from '@/lib/loaners';

// #42 — "מסירת רכב חליפי": who may use the module, the deductible-waiver
// price, and the documents the customer signs.

describe('waiverCost', () => {
  test('per day + VAT, both days counted', () => {
    expect(waiverCost('2026-10-15', '2026-10-15')).toEqual({ days: 1, beforeVat: 75, withVat: 88.5 });
    expect(waiverCost('2026-10-15', '2026-10-17')).toEqual({ days: 3, beforeVat: 225, withVat: 265.5 });
  });
  test('capped at the maximum', () => {
    expect(waiverCost('2026-10-01', '2026-10-30')).toEqual({ days: 30, beforeVat: 525, withVat: 619.5 });
  });
  test('missing or reversed dates → no price', () => {
    expect(waiverCost(null, '2026-10-15')).toBeNull();
    expect(waiverCost('2026-10-16', '2026-10-15')).toBeNull();
  });
});

describe('access', () => {
  test('office, CEO and drivers by role; anyone else only when given the module', () => {
    for (const r of LOANER_ROLES) expect(canUseLoaners(r)).toBe(true);
    expect(canUseLoaners('PAINTER')).toBe(false);
    expect(canUseLoaners('PAINTER', true)).toBe(true);
    expect(canUseLoaners(null)).toBe(false);
  });
  test('fuel levels include "ריק" and "מלא"', () => {
    expect(FUEL_LEVELS).toContain('ריק');
    expect(FUEL_LEVELS).toContain('מלא');
  });
});

describe('documents', () => {
  const input = { branchName: 'נתיבות', customerName: 'דני כהן', customerPlate: '1234567', loanerPlate: '7654321', loanerType: 'יאריס', givenAt: '2026-10-15T09:00:00Z', kmOut: 1000, fuelOut: 'מלא' };
  test('agreement + declaration always; the waiver annex only when chosen', () => {
    const plain = loanerDocuments(input);
    expect(plain.agreement.clauses.length).toBeGreaterThan(0);
    expect(plain.declaration.clauses.length).toBeGreaterThan(0);
    expect(plain.waiver).toBeNull();
    expect(loanerDocuments({ ...input, waiver: { from: '2026-10-15', to: '2026-10-16' } }).waiver).not.toBeNull();
  });
  test('the loaner plate is in the agreement', () => {
    const text = JSON.stringify(loanerDocuments(input).agreement);
    expect(text).toContain('7654321');
  });
});
