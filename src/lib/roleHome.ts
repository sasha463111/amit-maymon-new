import type { UserRole } from '@/types/database';

/** The page each role lands on: after logging in, and when the app is opened
 *  while already signed in. One map, so both can never drift apart. */
export const ROLE_HOME: Record<UserRole, string> = {
  SERVICE_MANAGER: '/cases',
  OFFICE: '/closure',
  CEO: '/approvals',
  PAINTER: '/extras/new',
  SERVICE_ADVISOR: '/cases',
  WAREHOUSE: '/returns',
  WAREHOUSE_MANAGER: '/returns',
  COLLECTIONS: '/collections',
  ACCOUNTANT: '/finance',
  DRIVER: '/loaners',
};

export function homeForRole(role: string | null | undefined, officeFunction?: string | null): string {
  // "משרד הפניות" works on referrals, not on closure (staffJobs.ts).
  if (role === 'OFFICE' && officeFunction === 'REFERRALS') return '/referrals';
  return ROLE_HOME[(role ?? 'SERVICE_ADVISOR') as UserRole] ?? '/cases';
}
