import { describe, expect, test } from 'vitest';
import { formatIsraeliPlate } from '@/lib/plate';
import { looksLikeCompany, normalizeId, validEmail, validIsraeliId } from '@/lib/customerTax';
import { matchesCaseQuery } from '@/lib/caseQuery';
import { trackStep, TRACK_STEPS } from '@/lib/caseTrack';

// #42 — "פתיחת תיק": the plate, the customer's ID / company check, finding the
// case again, and the stage the customer sees on the tracking link.

describe('plate', () => {
  test('7 and 8 digits get their dashes; anything else is left as typed', () => {
    expect(formatIsraeliPlate('1234567')).toBe('12-345-67');
    expect(formatIsraeliPlate('12345678')).toBe('123-45-678');
    expect(formatIsraeliPlate('12-345-67')).toBe('12-345-67');
    expect(formatIsraeliPlate(' abc ')).toBe('abc');
  });
});

describe('customer ID', () => {
  test('check digit', () => {
    expect(validIsraeliId('123456782')).toBe(true);
    expect(validIsraeliId('123456789')).toBe(false);
    expect(validIsraeliId('000000000')).toBe(false);
    expect(validIsraeliId('')).toBe(false);
  });
  test('leading zeros are restored', () => {
    expect(normalizeId('18')).toBe('18');
    expect(normalizeId('12345')).toBe('000012345');
    expect(normalizeId('03-123-456')).toBe('003123456');
  });
  test('a company: ח.פ prefix or the name', () => {
    expect(looksLikeCompany(null, '513539148')).toBe(true);
    expect(looksLikeCompany('מוסך תהילה בע״מ', null)).toBe(true);
    expect(looksLikeCompany('דני כהן', '123456782')).toBe(false);
  });
  test('email', () => {
    expect(validEmail('a@b.co')).toBe(true);
    expect(validEmail('a@b')).toBe(false);
  });
});

describe('finding a case', () => {
  test('a plate typed with dashes matches the stored digits', () => {
    expect(matchesCaseQuery('12-345-67', ['1234567', 'דני'])).toBe(true);
    expect(matchesCaseQuery('דני', [null, 'דני כהן'])).toBe(true);
    expect(matchesCaseQuery('', [])).toBe(true);
    expect(matchesCaseQuery('9999', ['1234567'])).toBe(false);
  });
});

describe('customer tracking stage', () => {
  const c = { painter_status: null as string | null, closed_at: null as string | null, painter_finished_at: null as string | null, treatment_finished_at: null as string | null };
  test('painter status → the step the customer sees', () => {
    expect(trackStep({ ...c, painter_status: 'WAITING_APPRAISER' }).step).toBe(1);
    expect(trackStep({ ...c, painter_status: 'WAITING_PARTS' }).step).toBe(2);
    expect(trackStep({ ...c, painter_status: 'PARTS_ARRIVED' }).step).toBe(3);
    expect(trackStep({ ...c, painter_status: 'IN_WORK' }).step).toBe(3);
    expect(trackStep({ ...c, painter_status: 'READY_FOR_RELEASE' }).step).toBe(4);
  });
  test('finished work = ready; a closed case = delivered', () => {
    expect(trackStep({ ...c, painter_status: 'IN_WORK', painter_finished_at: '2026-10-15' }).step).toBe(4);
    expect(trackStep({ ...c, closed_at: '2026-10-16' }).step).toBe(TRACK_STEPS.length);
  });
});
