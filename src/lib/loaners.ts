// Replacement cars ("מעקב רכב חליפי", Amit 2026-10-14). Shared by the screen,
// the server actions and the printable documents.

/** Office (אילנה, אילנית, אביה) + CEO. */
export const LOANER_ROLES: readonly string[] = ['CEO', 'OFFICE'];
export const canUseLoaners = (role: string | null | undefined) => LOANER_ROLES.includes(role ?? '');

export const FUEL_LEVELS = ['מלא', '3/4', '1/2', '1/4', 'רזרבה'] as const;

/** Bump when the text changes — the version the customer signed is stored. */
export const AGREEMENT_VERSION = '2026-10-14-draft-2';

/** The driver's details as declared in the declaration (for transferring fines). */
export type DriverDetails = {
  full_name: string;
  id_number: string;
  license_number: string;
  address: string;
  phone: string;
};

export type AgreementInput = {
  branchName: string | null;
  customerName: string | null;
  customerPlate: string | null;
  loanerPlate: string;
  loanerType: string | null;
  givenAt: string; // ISO
  kmOut: number | null;
  fuelOut: string | null;
  driver?: Partial<DriverDetails> | null;
};

export type LegalDoc = { title: string; intro: string; clauses: string[] };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '__________');

/**
 * Two documents signed together at hand-over (drafts — for the company
 * lawyer's review): (1) the loan agreement, (2) the driver's declaration and
 * undertaking (responsibility for the car and for traffic offences, correct
 * details). One signature confirms both.
 */
export function loanerDocuments(a: AgreementInput): { agreement: LegalDoc; declaration: LegalDoc; confirmation: string } {
  const d = a.driver ?? {};
  const company = `מוסך תהילה בע"מ, ח.פ. 513539148 (מרכז שירות תהילה${a.branchName ? `, סניף ${a.branchName}` : ''}; להלן: "המוסך")`;
  return {
    agreement: {
      title: 'הסכם השאלת רכב חליפי',
      intro:
        `הסכם זה נערך בין ${company}, לבין ${blank(a.customerName)} (להלן: "הלקוח"), ` +
        `בעל/ת הרכב מס' רישוי ${blank(a.customerPlate)} המצוי בתיקון במוסך.`,
      clauses: [
        `המוסך משאיל ללקוח את הרכב מס' רישוי ${a.loanerPlate}${a.loanerType ? ` (${a.loanerType})` : ''} (להלן: "הרכב החליפי"), לשימושו הסביר והזהיר, לתקופת תיקון רכבו בלבד. מועד המסירה: ${fmt(a.givenAt)}.`,
        `מצב הרכב החליפי במסירה: מד מרחק ${a.kmOut != null ? `${a.kmOut.toLocaleString('he-IL')} ק"מ` : '__________ ק"מ'}; מפלס דלק ${blank(a.fuelOut)}. הלקוח מאשר כי בדק את הרכב החליפי וקיבלו במצב תקין ונקי, למעט האמור בהערות המסירה ובתיעוד שצולם במעמד המסירה.`,
        'הלקוח ישיב את הרכב החליפי למוסך עם סיום תיקון רכבו, ולא יאוחר מ-24 שעות ממועד הודעת המוסך כי רכבו מוכן, כשהוא במצבו כפי שנמסר ועם מפלס דלק זהה.',
        'הנהיגה ברכב החליפי מותרת ללקוח בלבד, ולנהג נוסף רק בהסכמת המוסך מראש ובכתב; ובלבד שהנוהג מחזיק ברישיון נהיגה בר-תוקף לסוג הרכב ועומד בתנאי פוליסת הביטוח של הרכב החליפי.',
        'הלקוח לא ישתמש ברכב החליפי להסעת נוסעים או טובין בתמורה, לגרירה, להוראת נהיגה, לתחרות או למבחן, ולא יוציאו מגבולות מדינת ישראל. העישון ברכב החליפי אסור.',
        'הלקוח אחראי לכל נזק, אובדן או גניבה של הרכב החליפי או של חלק ממנו בתקופה שבה הוא ברשותו, לרבות סכום ההשתתפות העצמית על-פי פוליסת הביטוח של הרכב החליפי, ולכל נזק שאינו מכוסה בפוליסה.',
        'בכל מקרה של תאונה, תקלה, גניבה או פגיעה ברכב החליפי — הלקוח יודיע למוסך מיד, ובמקרה הנדרש גם למשטרת ישראל, וימסור את כל המסמכים והפרטים הנדרשים. הלקוח לא יבצע ולא יזמין תיקון כלשהו ברכב החליפי ללא אישור המוסך.',
        'השבת הרכב החליפי באיחור, או במצב החורג מבלאי סביר, תזכה את המוסך בתשלום בהתאם למחירונו ובשיפוי בגין כל הוצאה שנגרמה לו.',
        'פרטי הלקוח ישמשו לצורך ניהול השאלת הרכב החליפי, השבתו, וטיפול בדו"חות, באגרות ובנזקים הקשורים בו, ויישמרו במערכות המוסך בהתאם לדין.',
      ],
    },
    declaration: {
      title: 'הצהרת נהג והתחייבות',
      intro:
        `אני הח"מ, ${blank(d.full_name || a.customerName)}, ת.ז. ${blank(d.id_number)}, מס' רישיון נהיגה ${blank(d.license_number)}, ` +
        `כתובת: ${blank(d.address)}, טלפון: ${blank(d.phone)}, מצהיר/ה ומתחייב/ת בזאת כלפי המוסך כדלקמן:`,
      clauses: [
        `ידוע לי כי מרגע קבלת הרכב החליפי מס' רישוי ${a.loanerPlate} (${fmt(a.givenAt)}) ועד להשבתו בפועל למוסך, אני המחזיק/ה ברכב והאחראי/ת הבלעדי/ת לו ולשימוש בו.`,
        'אני אחראי/ת באופן אישי ובלעדי לכל עבירת תנועה, עבירת חניה, דו"ח, קנס, אגרה (לרבות כבישי אגרה, מנהרות וחניונים) וכל תשלום אחר שיוטלו בגין הרכב החליפי בתקופה האמורה, ואשא בהם במלואם.',
        'אני מסכים/ה כי המוסך ימסור את פרטיי לכל רשות מוסמכת לצורך הסבת דו"חות וקנסות על שמי, ומתחייב/ת לשתף פעולה בהליך ההסבה ולא להתנגד לו.',
        'ככל שהמוסך יידרש לשלם סכום כלשהו בגין האמור לעיל, אשפה אותו במלוא הסכום, בתוספת הוצאות הטיפול, מיד עם דרישתו הראשונה.',
        'אני מצהיר/ה כי כל הפרטים שמסרתי לעיל ובמסמכים שהצגתי נכונים, מלאים ומעודכנים, וכי רישיון הנהיגה שלי בתוקף ואינו נתון לפסילה או להגבלה. אני מתחייב/ת להודיע למוסך מיד על כל שינוי בפרטים אלה.',
        'ידוע לי כי מסירת פרטים שגויים או חלקיים עלולה לחייב אותי בכל נזק ובכל הוצאה שייגרמו למוסך כתוצאה מכך.',
      ],
    },
    confirmation: 'קראתי והבנתי את הסכם ההשאלה ואת הצהרת הנהג, קיבלתי את הרכב החליפי במצב המתואר, ואני מסכים/ה ומתחייב/ת לכל האמור בהם.',
  };
}
