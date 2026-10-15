import { randomInt } from 'crypto';

// Personal passwords (Amit, 2026-10-15: "תכין לכולם סיסמה… נשלח לכל אחד את
// הסיסמה שלו"). Easy to type on a phone, no look-alike letters (i/l/o), about
// 2^40 combinations — with Supabase's sign-in rate limit that is plenty.
// Server-only (node crypto).

const LETTERS = 'abcdefghjkmnpqrstuvwxyz';

function letters(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += LETTERS[randomInt(LETTERS.length)];
  return s;
}

/** e.g. "kmr-4829-tvb" */
export function generatePassword(): string {
  return `${letters(3)}-${randomInt(1000, 10000)}-${letters(3)}`;
}

