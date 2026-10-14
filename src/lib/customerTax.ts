// Customer ID + VAT-file check (Amit, 2026-10-14). A customer with a VAT file
// (עוסק מורשה / חברה) offsets VAT on car expenses: the insurer pays without
// the VAT share, and the customer pays it to the garage — against a CPA
// letter stating how much he offsets (1/3, 2/3, full). Asking while the car
// is still here saves chasing it a month later.
//
// There is no public API: the Tax Authority's "פרטי עוסק מורשה" lookup is a
// web form (for a person, the dealer number is the ID number). So the
// system flags, opens the form with the ID copied, and keeps the answer per
// ID for the next visit.

export const TAX_LOOKUP_URL = 'https://secapp.taxes.gov.il/sr-ezor-ishi/main/pirtey-osek';
export const TAX_INFO_URL = 'https://www.gov.il/he/service/vat-apply-online';

export type VatStatus = 'NONE' | 'DEALER' | 'COMPANY';
export type VatShare = 'THIRD' | 'TWO_THIRDS' | 'FULL';

export const VAT_STATUS_LABEL: Record<VatStatus, string> = {
  NONE: 'אין תיק מע״מ',
  DEALER: 'יש תיק מע״מ (עוסק)',
  COMPANY: 'חברה / תאגיד',
};
export const VAT_SHARE_LABEL: Record<VatShare, string> = {
  THIRD: '1/3',
  TWO_THIRDS: '2/3',
  FULL: 'מלא',
};

/** Digits only, left-padded to 9 (IDs are often typed without leading zeros). */
export function normalizeId(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length >= 5 && d.length <= 9 ? d.padStart(9, '0') : d;
}

/** Israeli ID / company number check digit. */
export function validIsraeliId(raw: string | null | undefined): boolean {
  const id = normalizeId(raw);
  if (!/^\d{9}$/.test(id) || /^0+$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(id[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** A company / partnership / association number (ח.פ 51…, 52…, 55…, 57…, 58…) or "בע״מ" in the name. */
export function looksLikeCompany(name: string | null | undefined, idNumber: string | null | undefined): boolean {
  const id = normalizeId(idNumber);
  if (/^5[12578]\d{7}$/.test(id)) return true;
  return /בע["״']?מ|ח\.?\s?פ\.?|חברה\s|עמותה|שותפות/.test(name ?? '');
}

export function validEmail(raw: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw ?? '').trim());
}
