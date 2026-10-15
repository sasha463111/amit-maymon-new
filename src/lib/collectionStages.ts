// Claim stages + reminder reasons (Amit, 2026-10-14: "תזכורת אוטומטית עם
// תפריט נפתח למה שידוע לנו וגם 'אחר' עם מלל חופשי ותזכורת"). The stage names
// are BAFI's, so the imported claims match. `days` = the automatic reminder
// to the case's collector after moving to that stage (null = none); it can be
// changed when the stage is set.

export type ClaimStage = { stage: string; days: number | null; check: string };

export const CLAIM_STAGES: ClaimStage[] = [
  { stage: 'ממתין לדוח שמאי', days: 7, check: 'לבדוק מול השמאי אם הדוח יצא' },
  { stage: 'ממתין למסמכים מהלקוח', days: 3, check: 'לבדוק אם הלקוח שלח את המסמכים' },
  { stage: 'הוגשה דרישת תשלום', days: 14, check: 'לבדוק מול החברה אם התשלום אושר' },
  { stage: 'ממתין לשיק חברה', days: 10, check: 'לבדוק אם הצ׳ק מהחברה הגיע' },
  { stage: 'ממתין לשיק צד שלישי', days: 10, check: 'לבדוק אם הצ׳ק מצד ג׳ הגיע' },
  { stage: 'בבירור מול החברה', days: 5, check: 'לחזור למטפל/ת בחברה' },
  { stage: 'חזרה לפוליסה', days: 7, check: 'לבדוק את התביעה מול הפוליסה' },
  { stage: 'דחיה', days: 3, check: 'להחליט: ערעור / פוליסה / משפטי' },
  { stage: 'עובר לטיפול עו"ד', days: 14, check: 'לבדוק מול עורך הדין מה המצב' },
  { stage: 'טיפול משפטי', days: 30, check: 'לבדוק מול עורך הדין מה המצב' },
  { stage: 'מטופל ע"י גורם חיצוני', days: 14, check: 'לבדוק מול הגורם החיצוני' },
  { stage: 'תביעה שולמה – נשלח שיק קרוע ללקוח', days: null, check: '' },
  { stage: 'טיפול הסתיים', days: null, check: '' },
];

export const OTHER = 'אחר';

export function stageRule(stage: string | null | undefined): ClaimStage | null {
  return CLAIM_STAGES.find((s) => s.stage === stage) ?? null;
}

/** Default reminder days for a stage — known stages by the table, a free-text ("אחר") stage a week. */
export function defaultStageDays(stage: string | null | undefined): number | null {
  if (!stage) return null;
  const r = stageRule(stage);
  return r ? r.days : 7;
}

export const REMIND_DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60];

export const REMINDER_REASONS = [
  'לבדוק אם הגיע דוח שמאי',
  'לבדוק אם התשלום / הצ׳ק הגיע',
  'להתקשר למטפל/ת בחברת הביטוח',
  'לשלוח דרישת תשלום',
  'לשלוח תזכורת על דרישת התשלום',
  'לבקש מסמכים חסרים מהלקוח',
  'לחזור ללקוח',
  'לבדוק מועד פירעון צ׳ק',
  'לבדוק מול צד ג׳',
  'להעביר למחלקה המשפטית',
];

/** Israel wall-clock date + hour → ISO instant (handles summer/winter time). */
export function israelTimeToIso(dateIso: string, hour: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hour - 2);
  for (let i = 0; i < 2; i++) {
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(new Date(guess))) % 24;
    guess += (hour - h) * 3_600_000;
  }
  return new Date(guess).toISOString();
}

/** Israel date `days` from now, moved off Fri/Sat to Sunday. */
export function israelWorkDateIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  let iso = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  if (wd === 5 || wd === 6) {
    const add = wd === 5 ? 2 : 1;
    iso = new Date(new Date(`${iso}T12:00:00Z`).getTime() + add * 86_400_000).toISOString().slice(0, 10);
  }
  return iso;
}

/** Why a claim goes to legal handling (Amit, 14/10: "סיבת התביעה המשפטית — הפרשים וכדומה"). */
export const LEGAL_REASONS = [
  'הפרשים — החברה שילמה פחות מהחשבונית',
  'דחיית התביעה',
  'ירידת ערך',
  'שכ״ט שמאי / הוצאות',
  'צד ג׳ לא משלם',
  'לקוח לא שילם (השתתפות עצמית / מע״מ)',
  'עיכוב בתשלום',
];
