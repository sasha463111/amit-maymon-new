// Password rules for a password a person chooses (Amit, 2026-10-15): simple
// enough not to frustrate anyone — at least 8 characters with a capital
// letter, a small letter, a digit and a special character. Shared by the
// change-password screen (live checklist) and the server action.

export const PASSWORD_RULES: { label: string; test: (s: string) => boolean }[] = [
  { label: 'לפחות 8 תווים', test: (s) => s.length >= 8 },
  { label: 'אות גדולה באנגלית (A-Z)', test: (s) => /[A-Z]/.test(s) },
  { label: 'אות קטנה באנגלית (a-z)', test: (s) => /[a-z]/.test(s) },
  { label: 'מספר (0-9)', test: (s) => /[0-9]/.test(s) },
  { label: 'תו מיוחד (למשל ! @ # - _ .)', test: (s) => /[^A-Za-z0-9\s]/.test(s) },
];

/** Shown on the change-password screen as an example — and refused as a password. */
export const PASSWORD_EXAMPLE = 'Tehila#2026';

export function passwordProblems(s: string): string[] {
  const out = PASSWORD_RULES.filter((r) => !r.test(s)).map((r) => r.label);
  if (s === PASSWORD_EXAMPLE) out.push('לא סיסמת הדוגמה');
  if (/\s/.test(s)) out.push('בלי רווחים');
  if (s.length > 72) out.push('עד 72 תווים');
  return out;
}
