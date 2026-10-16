import { describe, expect, it } from 'vitest';
import { safeExt, storageFileName } from '@/lib/storageKey';

// 16/10: Supabase Storage rejects non-ASCII keys ("Invalid key") — Ilanit's
// Hebrew-named PDF never uploaded. Keys must be ASCII; the Hebrew name stays in the DB.
describe('storageFileName', () => {
  it('keeps English names', () => {
    expect(storageFileName('IMG_2041.jpg')).toBe('IMG_2041.jpg');
  });
  it('all-Hebrew name → file.<ext>', () => {
    expect(storageFileName('גססה-זנה.pdf')).toBe('file.pdf');
  });
  it('mixed name keeps the ASCII part, lower-cases the extension', () => {
    expect(storageFileName('scan 12 רישיון.PDF')).toBe('scan_12.pdf');
  });
  it('never returns non-ASCII', () => {
    for (const n of ['שם עם רווחים.docx', 'תמונה', 'a/b\\c?.png', 'é—ü.jpg']) expect(storageFileName(n)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('safeExt', () => {
  it('falls back when there is no extension', () => {
    expect(safeExt('תמונה', 'jpg')).toBe('jpg');
    expect(safeExt('a.HEIC')).toBe('heic');
  });
});
