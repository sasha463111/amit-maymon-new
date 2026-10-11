import type { UserRole } from '@/types/database';

// The jobs a user can be given (Amit's notification spec, 2026-10-11). A job
// is a role plus, for the office, which office: "משרד הפניות" and "משרד
// סגירה" share the OFFICE role (same pages and permissions) but receive
// different notifications — see notification_is_relevant() in migration
// 20261011140000. Choosing the job when creating a user is all it takes for a
// new person to get the right notifications.

export type OfficeFunction = 'REFERRALS' | 'CLOSURE';

export type StaffJob = {
  key: string;
  role: UserRole;
  officeFunction: OfficeFunction | null;
  label: string;
  /** What this job is notified about — shown in Settings. */
  notifications: string;
};

export const STAFF_JOBS: StaffJob[] = [
  {
    key: 'SERVICE_ADVISOR',
    role: 'SERVICE_ADVISOR',
    officeFunction: null,
    label: 'יועץ/ת שירות פחחות',
    notifications: 'בקשות פחחים, הודעות אישיות, כל מה שקורה בתיק, תיק חדש',
  },
  {
    key: 'SERVICE_MANAGER',
    role: 'SERVICE_MANAGER',
    officeFunction: null,
    label: 'מנהל שירות',
    notifications: 'בקשות פחחים, הודעות אישיות, כל מה שקורה בתיק, תיק חדש',
  },
  {
    key: 'OFFICE_REFERRALS',
    role: 'OFFICE',
    officeFunction: 'REFERRALS',
    label: 'משרד הפניות',
    notifications: 'הפניות ותזכורות הפניות, הודעות אישיות',
  },
  {
    key: 'OFFICE_CLOSURE',
    role: 'OFFICE',
    officeFunction: 'CLOSURE',
    label: 'משרד סגירה',
    notifications: 'תיקים לסגירה, הודעות אישיות',
  },
  {
    key: 'PAINTER',
    role: 'PAINTER',
    officeFunction: null,
    label: 'פחח',
    notifications: 'רכב נכנס לעבודה, חלקים הגיעו, תזכורת לסמן התחלת עבודה, תשובות לבקשות, הודעות אישיות',
  },
  {
    key: 'CEO',
    role: 'CEO',
    officeFunction: null,
    label: 'מנכ"ל',
    notifications: 'כל ההתראות',
  },
];

export function jobFor(role: string | null | undefined, officeFunction: string | null | undefined): StaffJob | null {
  return (
    STAFF_JOBS.find((j) => j.role === role && j.officeFunction === (officeFunction ?? null)) ??
    // An OFFICE user without a function yet: both offices.
    (role === 'OFFICE' ? { key: 'OFFICE', role: 'OFFICE', officeFunction: null, label: 'משרד (הפניות + סגירה)', notifications: 'הפניות, תיקים לסגירה, הודעות אישיות' } : null)
  );
}

export function jobLabel(role: string | null | undefined, officeFunction: string | null | undefined): string {
  return jobFor(role, officeFunction)?.label ?? role ?? '—';
}

export function jobByKey(key: string): StaffJob | undefined {
  return STAFF_JOBS.find((j) => j.key === key);
}
