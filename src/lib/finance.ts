// Finance data entry (closure screen) — shared lists (Amit, 2026-10-12/14).

/** Appraisers (Amit's list of 34 + מאיר יעקובי, אבי נדב; "כ.מ" = "בר כ.מ"). Free text still allowed. */
export const APPRAISERS = [
  'זקצר', 'ערן גשר', 'בר כ.מ', 'זאב מצרפי', 'איתי וקנין', 'מרגוליס', 'גבריאלי', 'מתן יעקובי', 'אריק דהן',
  'שלומי שביב', 'גרוסהויס', 'אביב שמאים', 'וקסלר', 'ישראל ויזל', 'אבי שחור', 'ונציה', 'אבי מדר', 'אבי דנן',
  'אבי מרחיב', 'זאב טוניק', 'אשר גוואטה', 'רועי מאני', 'קשת שמאות', 'אייל נרקיס', 'גבי גלעד', 'למברוזו',
  'יהודה דואני', 'יורם שבתאי', 'משה יחיאל', 'מתן וירניק', 'עטיה שמאים', 'פלקון שירעד', 'שטיבי', 'שחף פופר',
  'מאיר יעקובי', 'אבי נדב',
] as const;

export const INSURERS = [
  'ביטוח ישיר', 'הראל', 'כלל', 'הפניקס', 'מגדל', 'מנורה', 'איילון', 'שלמה', 'הכשרה', 'AIG', 'אנקור',
  'שומרה', 'ביטוח חקלאי', 'יוניון מוביליטי', 'אמדוקס', 'רמות', 'ווישור', 'פרטי',
] as const;

export const CLAIM_TYPES = ['פוליסה', "צד ג'", "הסדר ג'"] as const;
export const IDF_CATEGORIES = ['צבא מול צבא', 'צבא מול אזרח', 'נזק עצמי'] as const;

export const WORK_SOURCE_LABEL = { DIRECT: 'הסדר ישיר תהילה', SHIR: 'מוקד ש.י.ר', IDF: 'צה"ל' } as const;
export type WorkSource = keyof typeof WORK_SOURCE_LABEL;

/** Defaults from the case's sub claim type. */
export function financeDefaultsFromSubType(sub: string | null | undefined): { workSource: WorkSource; claimType: string } {
  switch (sub) {
    case 'SHLOMO_POLICY': return { workSource: 'SHIR', claimType: 'פוליסה' };
    case 'SHLOMO_THIRD_PARTY': return { workSource: 'SHIR', claimType: "צד ג'" };
    case 'MILITARY': return { workSource: 'IDF', claimType: '' };
    case 'THIRD_PARTY': return { workSource: 'DIRECT', claimType: "צד ג'" };
    case 'THIRD_PARTY_SETTLEMENT': return { workSource: 'DIRECT', claimType: "הסדר ג'" };
    case 'POLICY': return { workSource: 'DIRECT', claimType: 'פוליסה' };
    default: return { workSource: 'DIRECT', claimType: '' };
  }
}

/** "כ.מ", "כ.מ שמאות", "כ. מ שמאות" … → "בר כ.מ"; "מתן יעקבי" → "מתן יעקובי"; "אשר גואטה" → "אשר גוואטה". */
export function normalizeAppraiser(name: string | null | undefined): string {
  const s = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (/^(בר )?כ\.? ?מ\.?( שמאות)?$/.test(s)) return 'בר כ.מ';
  if (s === 'מתן יעקבי') return 'מתן יעקובי';
  if (s === 'אשר גואטה') return 'אשר גוואטה';
  if (s === 'יעקב פלקון שירעד') return 'פלקון שירעד';
  return s;
}
