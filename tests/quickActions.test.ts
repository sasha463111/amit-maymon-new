import { describe, expect, it } from 'vitest';
import { actionsFor, matchesQuery, normalizeQuery } from '@/lib/quickActions';

// Ctrl+K screens + actions (16/10, UI round #12).
describe('matchesQuery', () => {
  it('a word prefix finds the action', () => {
    expect(matchesQuery('סימון חלק להחזרה החזרה החזר', 'החזר')).toBe(true);
  });
  it('final letters and emoji do not matter', () => {
    expect(normalizeQuery('📦 החזרות')).toBe('החזרות');
    expect(matchesQuery('רכב חליפי', 'רכב חליפ')).toBe(true);
    expect(matchesQuery('התראות פעמון', 'פעמונ')).toBe(true);
  });
  it('every typed word must match', () => {
    expect(matchesQuery('מסירת רכב חליפי', 'מסירת רכב')).toBe(true);
    expect(matchesQuery('מסירת רכב חליפי', 'מסירת חלק')).toBe(false);
  });
  it('an empty query matches nothing (the list shows actions instead)', () => {
    expect(matchesQuery('החזרות', '   ')).toBe(false);
  });
});

describe('actionsFor', () => {
  it('only actions whose screen is in the user menu', () => {
    const warehouse = actionsFor([{ href: '/today' }, { href: '/returns' }]).map((a) => a.href);
    expect(warehouse).toContain('/returns?new=1');
    expect(warehouse).not.toContain('/loaners?new=1');
    expect(warehouse).not.toContain('/extras/new');
  });
  it('painter (has /extras/mine) gets "new extra"; everyone gets password change', () => {
    const painter = actionsFor([{ href: '/painters' }, { href: '/extras/mine' }]).map((a) => a.href);
    expect(painter).toContain('/extras/new');
    expect(painter).toContain('/account/password');
  });
});
