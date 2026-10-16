// 📧 Outlook in the app — shared by server and client (no secrets here).

/** Who sees "📧 דואר". Pilot: CEO first (new features start CEO-only); then
 *  the collectors and advisors (Amit: "Outlook לכל הצוות"). */
export const OUTLOOK_ROLES: readonly string[] = ['CEO'];
export const canUseOutlook = (role: string | null | undefined) => OUTLOOK_ROLES.includes(role ?? '');

export type MailFolder = 'inbox' | 'sentitems';
export type MailListItem = { id: string; subject: string; fromName: string; fromEmail: string; receivedAt: string; preview: string; isRead: boolean; hasAttachments: boolean };
export type MailAttachment = { id: string; name: string; contentType: string; size: number };
export type MailFull = MailListItem & { to: string; cc: string; bodyHtml: string; internetMessageId: string | null; attachments: MailAttachment[] };
export type AttachTarget = { type: 'CASE' | 'COLLECTION' | 'REFERRAL'; id: string; label: string; plate: string | null; sub?: string };
export type CaseEmail = { id: string; subject: string | null; fromName: string | null; fromEmail: string | null; receivedAt: string | null; preview: string | null; bodyHtml: string | null; attachments: { name: string; path: string; size: number }[]; attachedBy: string | null; attachedAt: string };

/** Israeli plates (7 / 8 digits, with or without dashes) mentioned in an email — to suggest the case. */
export function platesIn(text: string): string[] {
  const out = new Set<string>();
  // Not part of a longer dashed / digit run (a phone 050-123-4567 is not plate 1234567).
  for (const m of text.matchAll(/(?<![\d-])(\d{2,3})[-\s]?(\d{2,3})[-\s]?(\d{2,3})(?![\d-])/g)) {
    const d = m[1] + m[2] + m[3];
    if (d.length === 7 || d.length === 8) out.add(d);
  }
  return Array.from(out).slice(0, 5);
}
