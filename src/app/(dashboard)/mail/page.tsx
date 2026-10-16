import { redirect } from 'next/navigation';
import { outlookStatus } from '@/app/actions/outlook';
import { MAIL_API } from './api';
import { MailClient } from './MailClient';

export const dynamic = 'force-dynamic';

// "📧 דואר" — the user's own Outlook mailbox (16/10; pilot: CEO).
export default async function MailPage({ searchParams }: { searchParams: Promise<{ err?: string; connected?: string }> }) {
  const sp = await searchParams;
  const s = await outlookStatus();
  if (!s.allowed) redirect('/today');
  return (
    <MailClient
      status={{ configured: s.configured, connected: s.connected, email: s.email }}
      api={MAIL_API}
      initialError={sp.err ? sp.err.slice(0, 200) : null}
    />
  );
}
