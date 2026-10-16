// Ctrl+K reaches screens and actions too, not only cases (16/10, UI round #12).
// An action shows only when its screen is in the user's own menu — the menu is
// already filtered by role / permission, so nobody sees an action they can't do.
// Words: what people actually type (their words, not the system's).

export type QuickAction = { label: string; href: string; icon: string; words: string; needs: string[] };

export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'סימון חלק להחזרה (צילום מדבקה)', href: '/returns?new=1', icon: '📦', words: 'החזרה החזר חלק מדבקה ספק זיכוי מחסן', needs: ['/returns'] },
  { label: 'מסירת רכב חליפי', href: '/loaners?new=1', icon: '🚗', words: 'רכב חליפי חלופי מסירה השאלה הסכם', needs: ['/loaners'] },
  { label: 'תוספת פחחות חדשה', href: '/extras/new', icon: '➕', words: 'תוספת פחחות פחח עבודה נוספת', needs: ['/extras', '/extras/mine'] },
  { label: 'הערה לשיפור / דיווח על תקלה', href: '/requests', icon: '💡', words: 'הערה שיפור באג תקלה בעיה הצעה', needs: ['/requests'] },
  { label: 'החלפת סיסמה', href: '/account/password', icon: '🔑', words: 'סיסמה סיסמא החלפה', needs: [] },
];

/** Extra words per screen, on top of its menu label. */
export const SCREEN_WORDS: Record<string, string> = {
  '/today': 'היום בית ראשי',
  '/dashboards': 'דשבורד נתונים סטטיסטיקה',
  '/cases': 'תיקים תיק רכבים',
  '/messages': 'הודעות שאלות הערות',
  '/mail': 'דואר מייל אאוטלוק',
  '/approvals': 'אישורים עמית אישור',
  '/closure': 'סגירה סגירת תיק משרד',
  '/referrals': 'הפניות הפניה פתיחה',
  '/loaners': 'רכב חליפי חלופי השאלה',
  '/painters': 'פחחים פחח לוח',
  '/returns': 'החזרות החזרה חלקים מחסן זיכוי חשבוניות',
  '/finance': 'כספים כסף הכנסות',
  '/collections': 'גבייה תביעות ביטוח שמאי',
  '/legal': 'משפטי עורך דין תביעה',
  '/receivables': 'גבייה חובות דשבורד',
  '/notifications': 'התראות פעמון',
  '/cases/archive': 'ארכיון סגורים ישנים',
  '/settings': 'הגדרות עובדים הרשאות',
  '/requests': 'הצעות ייעול שיפור',
  '/bugs': 'באגים תקלות',
  '/features': 'פיתוחים',
  '/extras': 'תוספות פחחות',
  '/extras/mine': 'התוספות שלי',
};

/** Emoji / punctuation off, final letters folded — "רכב חלופי" finds "רכב חליפי". */
export function normalizeQuery(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' })[c] ?? c)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every typed word must start a word in the text (or appear inside a long one). */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return false;
  const words = normalizeQuery(text).split(' ');
  return q.split(' ').every((t) => words.some((w) => w.startsWith(t) || (t.length >= 3 && w.includes(t))));
}

export function actionsFor(links: { href: string }[]): QuickAction[] {
  const have = new Set(links.map((l) => l.href));
  return QUICK_ACTIONS.filter((a) => a.needs.length === 0 || a.needs.some((h) => have.has(h)));
}
