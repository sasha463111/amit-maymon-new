// Shared by the "מה מחכה לי היום" loader (server) and screen (client).

export type TodayItem = { plate?: string | null; title: string; sub?: string; href?: string };
export type TodayCard = { key: string; num: string; label: string; tone: 'late' | 'warn' | 'ok' | 'info'; href: string; items?: TodayItem[]; wide?: boolean };
export type TodayRole = 'ceo' | 'office' | 'warehouse' | 'painter' | 'advisor' | 'collections' | 'driver';
export const ROLE_TABS: [TodayRole, string][] = [
  ['ceo', 'עמית · מנכ״ל'],
  ['advisor', 'יועץ / מנהל שירות'],
  ['painter', 'פחח'],
  ['office', 'משרד'],
  ['warehouse', 'מחסן'],
  ['collections', 'תביעות'],
  ['driver', 'נהג'],
];
/** Whose screen it is — personal views filter by it (15/10: every role gets its own). */
export type TodayCtx = { userId: string; branchIds: string[]; supervisor: boolean };

