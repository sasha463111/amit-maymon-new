/**
 * Israeli plates come in two lengths: 7-digit (older, "12-345-67") and
 * 8-digit (current, "123-45-678"). We store raw digits with no separators,
 * so this inserts the right dash grouping for display.
 */
export function formatIsraeliPlate(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return raw.trim();
}
