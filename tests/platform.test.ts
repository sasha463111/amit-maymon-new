import { describe, expect, test } from 'vitest';
import { formatDate, formatDateTime, formatIsoDate, formatTime } from '@/lib/dates';
import { ROLE_HOME, homeForRole } from '@/lib/roleHome';
import { passwordProblems, PASSWORD_EXAMPLE } from '@/lib/passwordPolicy';

// #42 — rules every screen depends on. The dates tests run in UTC (vitest
// config), like the production server: #45/#46 were times 3 hours off there.

describe('dates are Israel time, also on a UTC server', () => {
  test('time', () => {
    expect(formatTime('2026-10-15T21:30:00Z')).toBe('00:30');
    expect(formatTime('2026-01-15T21:30:00Z')).toBe('23:30'); // winter: UTC+2
  });
  test('a date just after midnight in Israel is already the next day', () => {
    expect(formatDate('2026-10-15T22:30:00Z')).toBe('16/10/2026');
    expect(formatDateTime('2026-10-15T22:30:00Z')).toBe('16/10/2026 01:30');
  });
  test('date-only columns are not shifted', () => {
    expect(formatIsoDate('2026-09-23')).toBe('23/09/2026');
    expect(formatDate(null)).toBe('—');
  });
});

describe('home page', () => {
  test('everyone lands on "היום"', () => {
    for (const home of Object.values(ROLE_HOME)) expect(home).toBe('/today');
    expect(homeForRole('PAINTER')).toBe('/today');
    expect(homeForRole(null)).toBe('/today');
  });
});

describe('password policy', () => {
  test('a good password passes; the example and weak ones do not', () => {
    expect(passwordProblems('Garage#2027x')).toEqual([]);
    expect(passwordProblems(PASSWORD_EXAMPLE)).toContain('לא סיסמת הדוגמה');
    expect(passwordProblems('short').length).toBeGreaterThan(0);
    expect(passwordProblems('Has Space1!')).toContain('בלי רווחים');
  });
});
