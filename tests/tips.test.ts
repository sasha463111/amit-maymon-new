import { describe, expect, it } from 'vitest';
import { TIPS, pathMatches, tipsFor } from '@/lib/tips';

// First-visit tips (16/10, UI round #10).
describe('pathMatches', () => {
  it('exact path', () => {
    expect(pathMatches('/returns', '/returns')).toBe(true);
    expect(pathMatches('/returns', '/returns/x')).toBe(false);
  });
  it('"/*" = exactly one more segment (an id)', () => {
    expect(pathMatches('/painters/*', '/painters/abc')).toBe(true);
    expect(pathMatches('/painters/*', '/painters')).toBe(false);
    expect(pathMatches('/painters/*', '/painters/abc/edit')).toBe(false);
  });
});

describe('tipsFor', () => {
  it('follows the role', () => {
    expect(tipsFor('/referrals', 'OFFICE').map((t) => t.key)).toEqual(['referrals.new']);
    expect(tipsFor('/referrals', 'PAINTER')).toEqual([]);
    expect(tipsFor('/painters/x', 'PAINTER').map((t) => t.key)).toEqual(['painter.finish', 'painter.request']);
  });
  it('"today" tips are for everyone', () => {
    expect(tipsFor('/today', 'DRIVER').length).toBe(2);
  });
  it('keys are unique and short (DB check: 1–80 chars)', () => {
    const keys = TIPS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.length > 0 && k.length <= 80)).toBe(true);
  });
});
