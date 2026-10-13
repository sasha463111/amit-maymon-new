// A case's notes as one short line for the case cards (Amit, 2026-10-13: see
// notes without opening the case). Drops the "⚠️ הערות חשובות מההפנייה:"
// header that convertReferral adds (actions/referrals.ts) and collapses
// line breaks; the card clamps it to two lines and shows the rest on hover.
const REFERRAL_HEADER = /⚠️?\s*הערות חשובות מההפנייה:\s*/g;

export function cardNote(notes: string | null | undefined): string | null {
  const s = (notes ?? '').replace(REFERRAL_HEADER, '').replace(/\s+/g, ' ').trim();
  return s || null;
}
