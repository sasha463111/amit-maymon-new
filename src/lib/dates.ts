/**
 * Date formatting for the whole app. One place, one format: DD/MM/YYYY.
 *
 * Why not toLocaleDateString('he-IL'): it renders 5.9.2026 — dots, and no
 * leading zeros. That reads fine, but it disagreed with the date INPUT fields,
 * which show 05/09/2026. Two formats for the same date in one screen is how
 * people misread 09/05 as May.
 *
 * Why 'en-GB': it is the standard locale that produces exactly DD/MM/YYYY with
 * leading zeros. Nothing English is shown — every option below is numeric, so
 * no month names or English words can appear. Keeping the locale choice behind
 * these helpers means it is explained once here instead of looking like a
 * mistake at 24 call sites.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** DD/MM/YYYY — e.g. 05/09/2026. Returns '—' for missing/invalid input. */
export function formatDate(value: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-GB', DATE_OPTS) : fallback;
}

/** HH:mm in 24-hour form — e.g. 14:30. */
export function formatTime(value: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString('en-GB', TIME_OPTS) : fallback;
}

/** DD/MM/YYYY HH:mm — e.g. 05/09/2026 14:30. */
export function formatDateTime(value: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? `${formatDate(d)} ${formatTime(d)}` : fallback;
}

/**
 * Formats a plain ISO date string (YYYY-MM-DD) WITHOUT constructing a Date.
 *
 * Use this for date-only database columns such as event_date and
 * follow_up_date. `new Date('2026-09-23')` is parsed as UTC midnight, so in a
 * timezone behind UTC it renders as the 22nd — a real off-by-one-day bug that
 * only shows up for some users.
 */
export function formatIsoDate(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fallback;
}
