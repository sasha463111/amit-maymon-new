// Replacement cars ("מעקב רכב חליפי", Amit 2026-10-14). Shared by the screen,
// the server actions, the printable documents and the customer's link.
// v2: merged with the garage's paper forms (מסירת/קבלת רכב חליפי, טופס רכב
// חליפי, ביטול השתתפות עצמית) — Amit, 14/10.

/** Office (אילנה, אילנית, אביה) + CEO + drivers (ינון, יצחק — 15/10). Plus
 *  anyone with profiles.loaners_access (the painters בתאל, דקל, כפיר, ניסים). */
export const LOANER_ROLES: readonly string[] = ['CEO', 'OFFICE', 'DRIVER'];
export const canUseLoaners = (role: string | null | undefined, access = false) => access || LOANER_ROLES.includes(role ?? '');

export const FUEL_LEVELS = ['ריק', '1/4', '1/2', '3/4', 'מלא'] as const;

/** Bump when the text changes — the version the customer signed is stored. */
export const AGREEMENT_VERSION = '2026-10-14-v2-draft';

// The garage's terms (from its paper forms).
export const DEDUCTIBLE_ILS = 4000; // incl. VAT
export const MIN_DRIVER_AGE = 24;
export const MIN_LICENSE_YEARS = 2;
export const TOLL_HANDLING_FEE_ILS = 100;
export const WAIVER_PER_DAY_ILS = 75; // + VAT
export const WAIVER_MAX_ILS = 525; // + VAT
export const VAT_RATE = 0.18;
/** The customer's link to the signed documents is valid for this long. */
export const SHARE_LINK_DAYS = 30;

/** Days of the deductible waiver (inclusive) and its price before / after VAT. */
export function waiverCost(from: string | null, to: string | null): { days: number; beforeVat: number; withVat: number } | null {
  if (!from || !to) return null;
  const d = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  if (!(d > 0)) return null;
  const beforeVat = Math.min(d * WAIVER_PER_DAY_ILS, WAIVER_MAX_ILS);
  return { days: d, beforeVat, withVat: Math.round(beforeVat * (1 + VAT_RATE) * 100) / 100 };
}

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
  customerCarModel?: string | null;
  loanerPlate: string;
  loanerType: string | null;
  givenAt: string; // ISO
  kmOut: number | null;
  fuelOut: string | null;
  driver?: Partial<DriverDetails> | null;
  waiver?: { from: string | null; to: string | null } | null;
};

export type LegalDoc = { title: string; intro: string; clauses: string[] };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '__________');
const ils = (n: number) => `${n.toLocaleString('he-IL')} ₪`;

/**
 * The documents signed at hand-over (drafts — for the company lawyer's
 * review): (1) the loan agreement, (2) the driver's declaration, and (3) when
 * chosen, the deductible waiver. One signature confirms them all.
 */
export function loanerDocuments(a: AgreementInput): { agreement: LegalDoc; declaration: LegalDoc; waiver: LegalDoc | null; confirmation: string } {
  const d = a.driver ?? {};
  const company = `מוסך תהילה בע"מ, ח.פ. 513539148 (מרכז שירות תהילה${a.branchName ? `, סניף ${a.branchName}` : ''}; להלן: "המוסך")`;
  const w = a.waiver ? waiverCost(a.waiver.from, a.waiver.to) : null;
  return {
    agreement: {
      title: 'הסכם השאלת רכב חליפי',
      intro:
        `הסכם זה נערך בין ${company}, לבין ${blank(a.customerName)} (להלן: "הלקוח"), ` +
        `בעל/ת הרכב מס' רישוי ${blank(a.customerPlate)}${a.customerCarModel ? ` (${a.customerCarModel})` : ''} המצוי בתיקון במוסך.`,
      clauses: [
        `המוסך משאיל ללקוח את הרכב מס' רישוי ${a.loanerPlate}${a.loanerType ? ` (${a.loanerType})` : ''} (להלן: "הרכב החליפי") לתקופת תיקון רכבו בלבד, לשימוש סביר וזהיר. מועד המסירה: ${fmt(a.givenAt)}.`,
        `מצב הרכב החליפי במסירה: מד מרחק ${a.kmOut != null ? `${a.kmOut.toLocaleString('he-IL')} ק"מ` : '__________ ק"מ'}; מפלס דלק ${blank(a.fuelOut)}. הלקוח מאשר כי בדק את הרכב החליפי וקיבלו במצב תקין, נקי וללא נזק, למעט האמור בהערות המסירה ובתיעוד שצולם במעמד המסירה.`,
        'הרכב החליפי מהווה רכב חלופי בלבד, ויתכן שקיימות בו מערכות, אביזרים ותוספות שאינם קיימים ברכבו של הלקוח; המוסך אינו מתחייב לדגם, לרמת גימור או לאבזור מסוימים.',
        `הנהיגה ברכב החליפי מותרת ללקוח, ולנהג נוסף רק בהסכמת המוסך מראש ובכתב — ובלבד שהנוהג בן ${MIN_DRIVER_AGE} לפחות, מחזיק ברישיון נהיגה בר-תוקף לסוג הרכב מזה ${MIN_LICENSE_YEARS} שנים לפחות, ואינו "נהג צעיר" או "נהג חדש". הלקוח לא ירשה לכל אדם אחר לנהוג ברכב.`,
        'הלקוח ישתמש ברכב החליפי שימוש רגיל, באופן התואם את מטרתו ובהתאם להוראות כל דין; לא ינהג בו בדרכים שאינן סלולות, לא יסיע בו בעלי חיים, לא יעשן בו, לא ישתמש בו להסעת נוסעים או טובין בתמורה, לגרירה, להוראת נהיגה, לתחרות או למבחן, ולא יוציאו מגבולות מדינת ישראל.',
        'הלקוח לא ינהג ולא ישהה ברכב החליפי בשטחי הרשות הפלסטינית (שטח A).',
        `הלקוח אחראי לכל נזק, תקלה, אובדן או גניבה של הרכב החליפי או של חלק ממנו בתקופה שבה הוא ברשותו, לרבות כתוצאה משימוש שאינו נכון ו/או רשלני ו/או בניגוד לדין, וישלם השתתפות עצמית בסך ${ils(DEDUCTIBLE_ILS)} כולל מע"מ לכל מקרה. ידוע ללקוח כי ההשתתפות העצמית אינה מכסה נזק לצמיגים ולמרכב התחתון, ובמקרה כזה יישא הלקוח במלוא עלות התיקון. על נזק שאינו מכוסה בביטוח הרכב החליפי יישא הלקוח במלואו.`,
        'בכל מקרה של תאונה, תקלה, גניבה, אובדן או נזק — הלקוח ידווח למוסך מיד, ובמקרה הנדרש גם למשטרת ישראל, ויפעל בעניין בהתאם להנחיות המוסך. הלקוח לא יבצע ולא יזמין תיקון כלשהו ברכב החליפי ללא אישור המוסך.',
        'ידוע ללקוח כי ברכב החליפי מותקנת מערכת איתור (כגון איתוראן), והוא מסכים לאיכון הרכב ולקבלת כל מידע בדבר מיקומו ואופן הנהיגה בו.',
        'למוסך אין אחריות לחפצים או לציוד שהלקוח ישאיר ברכב החליפי, לרבות אובדן או נזק להם.',
        'הלקוח ישיב את הרכב החליפי למוסך מיד עם הודעת המוסך כי רכבו מוכן, ולא יאוחר מ-24 שעות ממועדה, כשהוא במצבו כפי שנמסר ועם מפלס דלק זהה לזה שבמסירה. השבה באיחור, או במצב החורג מבלאי סביר, תזכה את המוסך בתשלום בהתאם למחירונו ובשיפוי בגין כל הוצאה שנגרמה לו.',
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
        `אני בן/בת ${MIN_DRIVER_AGE} לפחות, ומחזיק/ה ברישיון נהיגה בר-תוקף לסוג הרכב מזה ${MIN_LICENSE_YEARS} שנים לפחות, שאינו נתון לפסילה, להתליה או להגבלה.`,
        'אני אחראי/ת באופן אישי ובלעדי לכל עבירת תנועה, עבירת חניה, דו"ח וקנס שיוטלו בגין הרכב החליפי בתקופה האמורה, ואשא בהם במלואם.',
        `אני אחראי/ת לתשלום כל נסיעה בכבישי אגרה (לרבות כביש 6, הנתיב המהיר ומנהרות הכרמל). בגין כל דו"ח, קנס או חיוב אגרה שיגיע למוסך, אחויב גם בדמי טיפול בסך ${ils(TOLL_HANDLING_FEE_ILS)}.`,
        'אני נותן/ת בזאת את הסכמתי הבלתי חוזרת להסבת כל דו"ח, קנס או חיוב כאמור על שמי, ומסכים/ה כי המוסך ימסור את פרטיי לכל רשות מוסמכת לשם כך ויעשה שימוש בטופס זה. אשתף פעולה בהליך ההסבה ולא אתנגד לו.',
        'ככל שהמוסך יידרש לשלם סכום כלשהו בגין האמור לעיל, אשפה אותו במלוא הסכום, בתוספת דמי הטיפול והוצאות הגבייה, מיד עם דרישתו הראשונה.',
        'אני מצהיר/ה כי כל הפרטים שמסרתי לעיל ובמסמכים שהצגתי נכונים, מלאים ומעודכנים, ומתחייב/ת להודיע למוסך מיד על כל שינוי בהם. ידוע לי כי מסירת פרטים שגויים או חלקיים עלולה לחייב אותי בכל נזק ובכל הוצאה שייגרמו למוסך כתוצאה מכך.',
      ],
    },
    waiver: a.waiver
      ? {
          title: 'ביטול השתתפות עצמית לרכב חליפי',
          intro: `אני הח"מ, ${blank(d.full_name || a.customerName)}, ת.ז. ${blank(d.id_number)}, מבקש/ת לרכוש ביטול השתתפות עצמית לרכב החליפי מס' רישוי ${a.loanerPlate}:`,
          clauses: [
            `העלות: ${ils(WAIVER_PER_DAY_ILS)} + מע"מ ליום, ועד לסכום מרבי של ${ils(WAIVER_MAX_ILS)} + מע"מ.`,
            `התקופה: מיום ${a.waiver.from ? fmtDate(a.waiver.from) : '__________'} עד יום ${a.waiver.to ? fmtDate(a.waiver.to) : '__________'}` +
              (w ? ` — סה"כ ${w.days} ימים, ${ils(w.beforeVat)} + מע"מ (${ils(w.withVat)} כולל מע"מ).` : '.'),
            `ביטול ההשתתפות העצמית חל על נזק לרכב החליפי המכוסה בביטוח, ופוטר את הלקוח מתשלום ההשתתפות העצמית בסך ${ils(DEDUCTIBLE_ILS)}. הוא אינו חל על נזק לצמיגים ולמרכב התחתון, על נזק שנגרם בנהיגה של מי שאינו מורשה לנהוג ברכב, בניגוד לתנאי הסכם זה או בניגוד לדין, ועל דו"חות, קנסות ואגרות.`,
          ],
        }
      : null,
    confirmation:
      'קראתי והבנתי את הסכם ההשאלה, את הצהרת הנהג' +
      (a.waiver ? ' ואת ביטול ההשתתפות העצמית' : '') +
      ', קיבלתי את הרכב החליפי במצב המתואר, ואני מסכים/ה ומתחייב/ת לכל האמור בהם. עותק המסמכים החתומים יישלח אליי.',
  };
}
