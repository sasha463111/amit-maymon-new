// Customer documents link (Amit, 2026-10-14). Shared by the staff screen, the
// public page (/d/[token]) and the upload API. Server-only parts (token
// hashing, service client) live in customerDocLinks.server.ts.

/** Who may send links. Pilot: CEO only until the company lawyers approve the
 *  consent text (Amit sent it to Ron and Yossi, 14/10). Then add OFFICE. */
export const CUSTOMER_LINK_ROLES: readonly string[] = ['CEO'];

export function canSendCustomerLink(role: string | null | undefined): boolean {
  return CUSTOMER_LINK_ROLES.includes(role ?? '');
}

export const LINK_VALID_HOURS = 72;
export const MAX_FILES_PER_LINK = 40;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface DocItem {
  kind: string;
  label: string;
  hint?: string;
  /** Several photos allowed (damage photos). */
  multi?: boolean;
  optional?: boolean;
}

// Placeholder list until Amit sends the document kit per claim type.
const BASE_ITEMS: DocItem[] = [
  { kind: 'ID', label: 'תעודת זהות', hint: 'כולל הספח' },
  { kind: 'DRIVER_LICENSE', label: 'רישיון נהיגה', hint: 'שני הצדדים', multi: true },
  { kind: 'CAR_LICENSE', label: 'רישיון רכב' },
  { kind: 'BANK', label: 'פרטי חשבון בנק', hint: 'צילום המחאה מבוטלת או אישור ניהול חשבון' },
  { kind: 'DAMAGE', label: 'תמונות הנזק', multi: true },
  { kind: 'OTHER', label: 'מסמך נוסף', multi: true, optional: true },
];

export function docItemsFor(claimType: string | null | undefined): DocItem[] {
  void claimType; // per-claim-type lists arrive with Amit's kit
  return BASE_ITEMS;
}

export function docKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return BASE_ITEMS.find((i) => i.kind === kind)?.label ?? null;
}

/** Bump when the text changes — the version the customer accepted is stored. */
export const CONSENT_VERSION = '2026-10-14-draft';

export function consentText(plate: string | null): { title: string; intro: string; sections: { head: string; body: string[] }[]; checkbox: string } {
  return {
    title: 'הסכמה לאיסוף מסמכים, שמירתם והעברתם',
    intro: `מוסך תהילה בע"מ, ח.פ. 513539148 (מרכז שירות תהילה, "המוסך"), מבקש ממך מסמכים לצורך הטיפול בתיקון רכבך${plate ? ` מס' ${plate}` : ''} ובתביעת הביטוח הקשורה לו.`,
    sections: [
      { head: '1. אילו מסמכים ולמה', body: ['צילום תעודת זהות, רישיון נהיגה, רישיון רכב, פרטי חשבון בנק (צילום המחאה מבוטלת או אישור ניהול חשבון), תמונות הנזק ותיאור האירוע. המסמכים ישמשו אך ורק לצורך הטיפול ברכב ובתביעה.'] },
      { head: '2. למי יועבר המידע', body: ["לחברת הביטוח המטפלת בתביעה, לשמאי שמונה לבדיקת הנזק, ובמידת הצורך לגורם נוסף הקשור ישירות לתביעה (למשל חברת הביטוח של צד ג'). המידע לא יועבר לשום גורם אחר ולא ישמש לשיווק."] },
      { head: '3. מסירת המסמכים היא מרצונך', body: ['אינך חייב/ת על פי חוק למסור אותם. ניתן למסור אותם גם באופן אחר (במוסך, או ישירות מול חברת הביטוח). אי-מסירתם עלולה לעכב את הטיפול בתביעה.'] },
      { head: '4. שמירה ואבטחה', body: ['המסמכים נשמרים במערכת מאובטחת, עם גישה מוגבלת לעובדי המוסך המטפלים בתיק בלבד, ויישמרו כל עוד הם נדרשים לטיפול בתיק ולתקופה הנדרשת על פי דין.'] },
      { head: '5. זכויותיך', body: ['את/ה רשאי/ת לעיין במידע שנמסר עליך, לבקש לתקנו, או לבקש את מחיקתו כשאינו נדרש עוד. פניות: אילנית 054-2628814, אביה 054-2793363, CR@toyota-tehila.co.il.'] },
      {
        head: '6. הצהרות הלקוח',
        body: [
          'המסמכים שאני מעלה שייכים לי, או שאני מורשה מטעם בעליהם למסור אותם.',
          'המידע שמסרתי נכון ומדויק למיטב ידיעתי.',
          'ידוע לי שההחלטות בתביעה, ובכלל זה גובה הפיצוי, מתקבלות על ידי חברת הביטוח והשמאי ולא על ידי המוסך.',
          'ידוע לי שמסמכים שאשלח בערוץ אחר מהקישור המאובטח (למשל וואטסאפ או דוא"ל רגיל) נשלחים באחריותי.',
        ],
      },
    ],
    checkbox: 'קראתי, הבנתי ואני מסכים/ה לאיסוף המסמכים, לשמירתם ולהעברתם כמפורט לעיל.',
  };
}

export function firstName(full: string | null | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

export function customerMessage(opts: { customerName: string | null; clerkName: string | null; branchName: string | null; plate: string | null; url: string; kitCount?: number }): string {
  const hello = firstName(opts.customerName) ? `שלום ${firstName(opts.customerName)} 👋` : 'שלום 👋';
  const clerk = firstName(opts.clerkName);
  const from = `${clerk ? `כאן ${clerk} ` : ''}ממרכז שירות תהילה${opts.branchName ? ` סניף ${opts.branchName}` : ''}.`;
  return [
    `${hello} ${from}`,
    `כדי שנוכל לקדם את הטיפול ברכב${opts.plate ? ` ${opts.plate}` : ''} מול חברת הביטוח, נשמח שתעלה/י את המסמכים בקישור המאובטח הבא:`,
    opts.url,
    ...(opts.kitCount ? [`בקישור יש גם ${opts.kitCount === 1 ? 'טופס קצר' : `${opts.kitCount} טפסים קצרים`} לחתימה דיגיטלית — ממלאים מה שחסר וחותמים באצבע.`] : []),
    `הקישור אישי ובתוקף ל-${LINK_VALID_HOURS} שעות. לכל שאלה אנחנו זמינים כאן.`,
  ].join('\n');
}

/** wa.me link for an Israeli mobile (05X…) — null when the number is unusable. */
export function whatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  let intl: string | null = null;
  if (/^05\d{8}$/.test(digits)) intl = '972' + digits.slice(1);
  else if (/^9725\d{8}$/.test(digits)) intl = digits;
  const q = encodeURIComponent(text);
  return intl ? `https://wa.me/${intl}?text=${q}` : null;
}
