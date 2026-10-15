import { describe, expect, test } from 'vitest';
import { PART_RETURNS_ROLES, PART_RETURN_ALERT_DAYS, PART_RETURN_REASONS, PART_RETURN_SUPPLIERS, canUsePartReturns } from '@/lib/partReturns';

// #42 — "החזרת חלק": who may record returns, the lists the form offers, and
// the reminder thresholds.

describe('part returns', () => {
  test('the roles that work with returns', () => {
    for (const r of PART_RETURNS_ROLES) expect(canUsePartReturns(r)).toBe(true);
    expect(canUsePartReturns('WAREHOUSE')).toBe(true);
    expect(canUsePartReturns('DRIVER')).toBe(false);
    expect(canUsePartReturns(undefined)).toBe(false);
  });
  test('suppliers and reasons always end with "אחר" (free text)', () => {
    expect(PART_RETURN_SUPPLIERS[PART_RETURN_SUPPLIERS.length - 1]).toBe('אחר');
    expect(PART_RETURN_REASONS[PART_RETURN_REASONS.length - 1]).toBe('אחר');
    expect(PART_RETURN_SUPPLIERS).toContain('טויוטה');
  });
  test('reminders: the manager at 7 days, the CEO at 14', () => {
    expect(PART_RETURN_ALERT_DAYS).toEqual({ manager: 7, ceo: 14 });
  });
});
