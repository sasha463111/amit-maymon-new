// "קיט מסמכים" (Amit, 2026-10-15, Discussion #4): the claim document kit,
// typed cleanly from Amit's scanned kit, filled from the referral / case and
// typed into on screen. Shared by the staff screen and (next stage) the
// customer link. Texts follow Amit's documents word for word; the personal
// guarantee was barely legible in the scan — rebuilt, marked for the lawyers.

export type KitFieldKey =
  | 'date' | 'customer_name' | 'id_number' | 'plate' | 'insurer' | 'garage' | 'address' | 'phone'
  | 'event_date' | 'driver_license' | 'guarantee_company' | 'bank_account' | 'bank_branch' | 'bank_number';

export const KIT_FIELDS: Record<KitFieldKey, { label: string; ltr?: boolean; width?: number }> = {
  date: { label: 'תאריך', width: 9 },
  customer_name: { label: 'שם הלקוח', width: 14 },
  id_number: { label: 'ת.ז.', ltr: true, width: 10 },
  plate: { label: 'מס׳ רישוי', ltr: true, width: 9 },
  insurer: { label: 'חברת הביטוח', width: 12 },
  garage: { label: 'שם המוסך', width: 14 },
  address: { label: 'כתובת', width: 20 },
  phone: { label: 'טלפון', ltr: true, width: 11 },
  event_date: { label: 'תאריך האירוע', width: 9 },
  driver_license: { label: 'מס׳ רישיון נהיגה', ltr: true, width: 10 },
  guarantee_company: { label: 'שם החברה / העסק', width: 14 },
  bank_account: { label: 'מס׳ חשבון', ltr: true, width: 10 },
  bank_branch: { label: 'מס׳ סניף', ltr: true, width: 5 },
  bank_number: { label: 'מס׳ בנק', ltr: true, width: 4 },
};

/** A paragraph with {{field}} placeholders. */
export type KitBlock =
  | { t: 'p'; text: string; bold?: boolean }
  | { t: 'list'; items: string[] }
  | { t: 'vat' } // the three VAT declarations — one is ticked
  | { t: 'fields'; keys: KitFieldKey[] } // label: value, one per line
  | { t: 'table'; keys: KitFieldKey[] }
  | { t: 'handwrite'; label: string; lines: string[] } // printed blank lines only — never typed or stored (card details)
  | { t: 'sign'; label?: string }
  | { t: 'draft'; text: string }; // shown on screen only

export type KitDoc = {
  id: string;
  title: string;
  subtitle?: string;
  letterhead: 'tehila' | 'shlomo';
  when: string; // for the index page
  signer: string;
  attach?: string[];
  to?: string; // "לכבוד"
  blocks: KitBlock[];
};

export const KIT_DOCS: KitDoc[] = [
  {
    id: 'declaration',
    title: 'טופס הצהרה והתחייבות של הלקוח',
    subtitle: 'אישור לתיקון רכב במוסך הסדר של החברה',
    letterhead: 'tehila',
    when: 'בכל תביעה',
    signer: 'הלקוח (בעל הרכב)',
    attach: ['צילום ת.ז.', 'צילום רישיון רכב', 'צילום רישיון נהיגה משני צדדיו'],
    blocks: [
      { t: 'p', text: 'הריני מצהיר/ה בזאת על רצוני לתקן את התאונה ו/או הנזק ברכב מס׳ רישוי {{plate}} במוסך {{garage}}, כל זאת בהתאם להוראות השמאי והחברה.' },
      { t: 'p', text: 'אני מתחייב/ת לשלם לפני שחרור הרכב מהמוסך את הסכומים הבאים: דמי השתתפות עצמית, כינון, מע״מ, חוב בגין פרמיה, וכל סכום אשר יתבקש לגבות על ידי נציגי החברה על חשבון התמורה עבור תיקון הרכב.' },
      { t: 'p', text: 'מצורפים:', bold: true },
      { t: 'list', items: ['צילום ת.ז.', 'צילום רישיון רכב', 'צילום רישיון נהיגה משני צדדיו'] },
      { t: 'fields', keys: ['customer_name', 'id_number', 'date'] },
      { t: 'sign' },
    ],
  },
  {
    id: 'no_arrangement',
    title: 'התחייבות לתשלום עד קבלת אישור הסדר',
    letterhead: 'tehila',
    when: 'תביעה לפוליסה, כשעדיין אין אישור הסדר מחברת הביטוח (לא במוקד ש.י.ר)',
    signer: 'הלקוח',
    to: 'לקוח נכבד,',
    blocks: [
      { t: 'p', text: 'מאחר ובשלב זה טרם קיבלנו אישור הסדר מחברת ביטוח {{insurer}} בגין תיקון רכב מספר {{plate}}, ועל מנת לתת לך את השירות הטוב ביותר ולהתחיל את התיקון מיד עם סיום בדיקת השמאי, נבקש את התחייבותך כדלהלן:' },
      { t: 'p', text: 'אני הח״מ {{customer_name}} ת.ז. {{id_number}} מתחייב/ת בזאת שבמידה ולא יהיה אישור הסדר מחברת הביטוח לרכב מס׳ {{plate}}, אני מתחייב/ת לשלם את כל גובה הנזק על תיקון הרכב.' },
      { t: 'fields', keys: ['customer_name', 'address', 'date'] },
      { t: 'sign' },
      { t: 'fields', keys: ['garage', 'plate'] },
    ],
  },
  {
    id: 'no_arrangement_shlomo',
    title: 'התחייבות לתשלום עד קבלת אישור הסדר',
    subtitle: 'מוקד ש.י.ר — שלמה רשת מוסכים',
    letterhead: 'shlomo',
    when: 'תביעה לפוליסה דרך מוקד ש.י.ר (שלמה), כשעדיין אין אישור הסדר',
    signer: 'הלקוח',
    to: 'לקוח נכבד,',
    blocks: [
      { t: 'p', text: 'מאחר ובשלב זה טרם קיבלנו אישור הסדר מחברת ביטוח {{insurer}} בגין תיקון רכב מס׳ {{plate}}, ועל מנת לתת לך את השירות הטוב ביותר ולהתחיל את התיקון מיד עם סיום בדיקת השמאי, נבקש את התחייבותך כדלהלן:' },
      { t: 'p', text: 'אני הח״מ {{customer_name}} ת.ז. {{id_number}} מתחייב/ת בזאת שבמידה ולא יהיה אישור הסדר מחברת הביטוח לרכב מס׳ {{plate}}, אני מתחייב/ת לשלם את כל גובה הנזק על תיקון הרכב.' },
      { t: 'fields', keys: ['customer_name', 'address', 'date'] },
      { t: 'sign' },
      { t: 'fields', keys: ['garage', 'plate'] },
    ],
  },
  {
    id: 'vat',
    title: 'תצהיר מבוטח למוסך תהילה',
    subtitle: 'מע״מ',
    letterhead: 'tehila',
    when: 'תביעה לפוליסה — עוסק מורשה / מתקזז מע״מ (לצרף אישור רו״ח על שיעור הקיזוז; בחברה גם אישור בעלות)',
    signer: 'הלקוח',
    attach: ['לעוסק מורשה: אישור רו״ח על שיעור קיזוז המע״מ', 'לחברה: אישור בעלות'],
    blocks: [
      { t: 'p', text: 'אני החתום/ה {{customer_name}} בעל/ת ת.ז. מס׳ {{id_number}} מצהיר/ה בזאת כדלקמן:' },
      { t: 'vat' },
      { t: 'p', text: 'זהו שמי וחתימתי ותוכן תצהירי כרשום לעיל אמת ונכון.' },
      { t: 'handwrite', label: 'פרטי אשראי לקוח (ממלאים בכתב יד במוסך בלבד — לא נשמרים במערכת)', lines: ['מספר כרטיס', 'תוקף', '3 ספרות בגב הכרטיס', 'שם בעל הכרטיס', 'ת.ז. בעל הכרטיס'] },
      { t: 'fields', keys: ['date'] },
      { t: 'sign', label: 'חתימת הלקוח' },
    ],
  },
  {
    id: 'driver_consent',
    title: 'טופס הסכמה למסירת מידע ממשרד התחבורה לחברת הביטוח',
    subtitle: 'נתוני שאילתא נהיגה',
    letterhead: 'tehila',
    when: 'תביעה לפוליסה — לכל חברות הביטוח',
    signer: 'הנהג / בעל הרכב',
    to: 'לכבוד חברת הביטוח {{insurer}}',
    blocks: [
      { t: 'p', text: 'אני הח״מ, מסכים/ה בזה כי משרד התחבורה, התשתיות הלאומיות והבטיחות בדרכים יעביר לחברת הביטוח לה הוגשה התביעה, באמצעות איגוד חברות הביטוח, את המידע על רישיון הנהיגה שלי הדרוש לאור הפוליסה האמורה והמצוי במאגר נתוני הנהגים שברשות המשרד.' },
      { t: 'p', text: 'הסכמתי ניתנת לצורך בירור תביעתי כלפיכם.' },
      { t: 'table', keys: ['date', 'customer_name', 'id_number', 'plate', 'address', 'driver_license', 'event_date'] },
      { t: 'sign' },
    ],
  },
  {
    id: 'guarantee',
    title: 'ערבות אישית',
    subtitle: 'מוקד ש.י.ר — צד ג׳',
    letterhead: 'shlomo',
    when: 'תביעת צד ג׳ דרך מוקד ש.י.ר — ערבות לשיקים שהלקוח משאיר ל-90 יום',
    signer: 'הערב (הלקוח)',
    blocks: [
      { t: 'draft', text: 'הנוסח שוחזר מסריקה כמעט בלתי קריאה — לבדיקת עורכי הדין לפני שימוש.' },
      { t: 'p', text: 'אני הח״מ {{customer_name}} ת.ז. {{id_number}} ערב/ה בזאת כלפיכם ערבות אישית לפירעון התשלום בגין תיקון רכב מס׳ {{plate}}, לרבות השיקים שנמסרו לכם על ידי {{guarantee_company}} (להלן: "החברה").' },
      { t: 'p', text: 'ידוע לי כי השיקים יוצגו לפירעון בתוך 90 יום, וכי ערבותי זו תעמוד בתוקף גם אם לא תוגש על ידכם תביעה כנגד החברה.' },
      { t: 'p', text: 'פרטי חשבון השיקים:', bold: true },
      { t: 'fields', keys: ['bank_account', 'bank_branch', 'bank_number'] },
      { t: 'fields', keys: ['customer_name', 'address', 'date'] },
      { t: 'sign', label: 'חתימת הערב' },
    ],
  },
  {
    id: 'repair_50',
    title: 'אישור תיקון — נזק בגבולות 50% משווי הרכב',
    letterhead: 'tehila',
    when: 'כשעלות התיקון בגבולות 50% משווי הרכב והלקוח מאשר לתקן',
    signer: 'בעל הרכב',
    to: 'לכבוד מוסך תהילה בע״מ',
    blocks: [
      { t: 'p', text: 'הנדון: רכב מספר {{plate}}', bold: true },
      { t: 'p', text: 'ידוע לי כי עלות תיקון הנזק הינה בגבולות ה-50%, למרות זאת אישרתי את תיקון הרכב במוסך, ולא יהיו לי טענות כלפי המוסך / השמאי / חברת הביטוח.' },
      { t: 'fields', keys: ['customer_name', 'phone', 'id_number', 'event_date', 'date'] },
      { t: 'sign', label: 'בכבוד רב' },
    ],
  },
];

export const VAT_OPTIONS = [
  'אין ברשותי עוסק מורשה ואינני מתקזז/ת מע״מ.',
  'יש ברשותי עוסק מורשה והנני מתקזז/ת מע״מ, ואני מתחייב/ת בזאת לשלם למוסך תהילה את מלוא התשלום כולל מע״מ בעבור התמורה (התיקון) שקיבלתי לכשיתקבל מחברת הביטוח, ללא קשר לקיזוז האישי עם רשויות המס.',
  'במידה ויקוזז מע״מ מסיבה כלשהי מסכום תקבולי הביטוח, הנני מתחייב/ת לשלם את מלוא התמורה, ללא קשר לקיזוז המע״מ.',
];

/** Which documents a claim needs (Amit's kit, page 1). The claim type is free text in referrals. */
export function suggestDocs(input: { claimType: string | null; insurer: string | null }): string[] {
  const ct = (input.claimType ?? '').replace(/\s+/g, ' ');
  const ins = input.insurer ?? '';
  const shlomo = /שלמה|ש\.?י\.?ר/.test(ins) || /^שלמה|ש\.?י\.?ר/.test(ct);
  const policy = /פוליסה|םוליסה/.test(ct);
  const thirdParty = !policy && /צד ג|נגד|מול|דרישה|הסדרי/.test(ct);
  const out = ['declaration'];
  if (policy) out.push(shlomo ? 'no_arrangement_shlomo' : 'no_arrangement', 'vat', 'driver_consent');
  if (thirdParty && shlomo) out.push('guarantee');
  return out;
}

export function claimKindLabel(claimType: string | null, insurer: string | null): string {
  const s = suggestDocs({ claimType, insurer });
  const shlomo = s.includes('no_arrangement_shlomo') || s.includes('guarantee');
  if (s.includes('vat')) return shlomo ? 'פוליסה · מוקד ש.י.ר' : 'פוליסה';
  if (s.includes('guarantee')) return 'צד ג׳ · מוקד ש.י.ר';
  return claimType ? `צד ג׳ / אחר (${claimType})` : 'לא הוגדר סוג תביעה';
}
