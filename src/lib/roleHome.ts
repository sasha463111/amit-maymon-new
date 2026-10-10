import type { UserRole } from '@/types/database';

/** The page each role lands on: after logging in, and when the app is opened
 *  while already signed in. One map, so both can never drift apart. */
export const ROLE_HOME: Record<UserRole, string> = {
  SERVICE_MANAGER: '/cases',
  OFFICE: '/closure',
  CEO: '/approvals',
  PAINTER: '/extras/new',
  SERVICE_ADVISOR: '/cases',
};

export function homeForRole(role: string | null | undefined): string {
  return ROLE_HOME[(role ?? 'SERVICE_ADVISOR') as UserRole] ?? '/cases';
}
