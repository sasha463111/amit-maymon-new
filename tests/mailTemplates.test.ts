import { describe, expect, test } from 'vitest';
import { MAIL_TEMPLATES, fillTemplate } from '@/lib/mailTemplates';

// 📝 Email templates (16/10): the case's details fill in; a missing one shows "____".
describe('mail templates', () => {
  test('details from the case fill in', () => {
    const t = MAIL_TEMPLATES.find((x) => x.id === 'payment_request')!;
    const out = fillTemplate(t.subject, { claimNumber: '2026-118842', plate: '77-412-90' });
    expect(out).toBe('בקשת תשלום — תביעה 2026-118842 · רכב 77-412-90');
  });
  test('a missing detail is marked to complete, never "undefined"', () => {
    const out = fillTemplate('תביעה {claimNumber} בסך {amount}', { claimNumber: '1' });
    expect(out).toBe('תביעה 1 בסך ____');
    expect(out).not.toContain('undefined');
  });
  test('every template has a label, subject and body', () => {
    for (const t of MAIL_TEMPLATES) expect(t.label && t.subject && t.body).toBeTruthy();
  });
});
