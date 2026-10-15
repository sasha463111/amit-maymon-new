import type { UserRole } from '@/types/database';

/** The page each role lands on: after logging in, and when the app is opened
 *  while already signed in. One map, so both can never drift apart.
 *  Since 16/10 (Tomer, design round): everyone lands on "🏠 היום" — what's
 *  waiting for me, what's urgent, and the one main action. */
export const ROLE_HOME: Record<UserRole, string> = {
  SERVICE_MANAGER: '/today',
  OFFICE: '/today',
  CEO: '/today',
  PAINTER: '/today',
  SERVICE_ADVISOR: '/today',
  WAREHOUSE: '/today',
  WAREHOUSE_MANAGER: '/today',
  COLLECTIONS: '/today',
  ACCOUNTANT: '/today',
  DRIVER: '/today',
};

export function homeForRole(role: string | null | undefined, _officeFunction?: string | null): string {
  return ROLE_HOME[(role ?? 'SERVICE_ADVISOR') as UserRole] ?? '/cases';
}
