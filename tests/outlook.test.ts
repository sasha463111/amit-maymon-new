import { describe, expect, test } from 'vitest';
import { canUseOutlook, platesIn } from '@/lib/outlook';

// 📧 Outlook (16/10): the case suggestion under "📎 שייך לתיק" comes from the
// plate numbers found in the email.

describe('platesIn', () => {
  test('7 and 8 digit plates, with or without dashes / spaces', () => {
    expect(platesIn('הודעת נזק לרכב 12-345-67 של הלקוח')).toEqual(['1234567']);
    expect(platesIn('רכב 123-45-678 ורכב 98 765 43')).toEqual(['12345678', '9876543']);
    expect(platesIn('מספר רישוי 7741290')).toEqual(['7741290']);
  });
  test('ignores phone numbers, amounts and claim numbers of other lengths', () => {
    expect(platesIn('טלפון 050-123-4567')).toEqual([]);
    expect(platesIn('סכום 25,527 ₪, תביעה 2026001234')).toEqual([]);
  });
  test('no duplicates, at most 5', () => {
    expect(platesIn('1234567 12-345-67 1234567')).toEqual(['1234567']);
  });
});

test('pilot: Outlook for the CEO first', () => {
  expect(canUseOutlook('CEO')).toBe(true);
  expect(canUseOutlook('PAINTER')).toBe(false);
});
