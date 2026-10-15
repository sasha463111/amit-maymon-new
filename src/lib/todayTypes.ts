// Shared by the "מה מחכה לי היום" loader (server) and screen (client).

export type TodayItem = { plate?: string | null; title: string; sub?: string; href?: string };
export type TodayCard = { key: string; num: string; label: string; tone: 'late' | 'warn' | 'ok' | 'info'; href: string; items?: TodayItem[]; wide?: boolean };
export type TodayRole = 'ceo' | 'office' | 'warehouse' | 'painter' | 'collections';
export const ROLE_TABS: [TodayRole, string][] = [
  ['ceo', 'עמית · מנכ״ל'],
  ['office', 'משרד'],
  ['warehouse', 'מחסן'],
  ['painter', 'פחחות'],
  ['collections', 'תביעות'],
];

