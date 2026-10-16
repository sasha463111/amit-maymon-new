// First-visit tips (16/10, UI round #10 / #39): 1–2 short tips per screen,
// per role, shown once — the first time a person opens that screen. "הבנתי"
// or "דלג" stores it in user_tips_seen, so it never comes back (any device).
// A tip points at an element marked data-tip="<anchor>"; the first VISIBLE one
// of `anchors` is used (phone and computer may show different buttons), and a
// tip whose anchor isn't on screen is simply not shown (and not marked seen).
// Pilot: CEO only (incl. "view as" another role) — TIPS_LIVE_FOR in layout.

export type Tip = {
  key: string;
  /** Pathname pattern: exact, or ending in "/*" for one more segment (an id). */
  path: string;
  /** Roles that see it; empty = everyone. */
  roles: string[];
  anchors: string[];
  title: string;
  body: string;
};

const ADVISORS = ['SERVICE_ADVISOR', 'SERVICE_MANAGER', 'CEO'];
const RETURNS_ROLES = ['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'PAINTER', 'ACCOUNTANT'];

export const TIPS: Tip[] = [
  { key: 'today.main', path: '/today', roles: [], anchors: ['today-main'], title: 'הכפתור הראשי שלך', body: 'כאן הפעולה שהכי הרבה עושים בתפקיד שלך. לחיצה אחת ואתם שם.' },
  { key: 'today.search', path: '/today', roles: [], anchors: ['search'], title: 'חיפוש לכל דבר', body: 'מספר רכב, שם לקוח, שם של מסך או פעולה (למשל "רכב חליפי"). במחשב אפשר גם Ctrl+K מכל מקום.' },
  { key: 'returns.new', path: '/returns', roles: RETURNS_ROLES, anchors: ['returns-new'], title: 'מסמנים חלק שחוזר לספק', body: 'מצלמים את המדבקה, והמערכת ממלאת לבד ספק, מק"ט ותיאור. רק בודקים ושומרים.' },
  { key: 'painter.finish', path: '/painters/*', roles: ['PAINTER', 'SERVICE_MANAGER', 'CEO', 'SERVICE_ADVISOR'], anchors: ['painter-bar', 'painter-finish'], title: 'סיום עבודה', body: 'כשהרכב מוכן לוחצים כאן. הרכב יורד מלוח הפחחים. התחרטתם? יש "ביטול" בהודעה שמופיעה למטה.' },
  { key: 'painter.request', path: '/painters/*', roles: ['PAINTER', 'SERVICE_MANAGER', 'CEO'], anchors: ['painter-request'], title: 'צריך חלקים או עבודה נוספת?', body: '"בקשה חדשה" — אפשר לצרף תמונה, והיועצים מקבלים התראה מיד.' },
  { key: 'referrals.new', path: '/referrals', roles: ['OFFICE', 'CEO'], anchors: ['referral-new'], title: 'פתיחת הפנייה', body: 'מקלידים מספר רכב והמערכת ממלאת את פרטי הרכב לבד. את המסמכים אפשר לצלם כבר בפתיחה.' },
  { key: 'cases.search', path: '/cases', roles: ADVISORS, anchors: ['cases-search'], title: 'חיפוש ברשימה', body: 'מספר רכב (גם חלקי, בלי מקפים), שם לקוח או מילה מההערות.' },
];

export const TIP_KEYS = new Set(TIPS.map((t) => t.key));

export function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return pathname.startsWith(base + '/') && !pathname.slice(base.length + 1).includes('/');
  }
  return pathname === pattern;
}

export function tipsFor(pathname: string, role: string): Tip[] {
  return TIPS.filter((t) => pathMatches(t.path, pathname) && (t.roles.length === 0 || t.roles.includes(role)));
}
