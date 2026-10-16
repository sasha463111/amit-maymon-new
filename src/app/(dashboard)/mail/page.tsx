import { redirect } from 'next/navigation';
import { attachMailToTarget, disconnectOutlook, getMail, listMail, outlookStatus, searchAttachTargets } from '@/app/actions/outlook';
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
      api={{ listMail, getMail, searchAttachTargets, attachMailToTarget, disconnectOutlook }}
      initialError={sp.err ? sp.err.slice(0, 200) : null}
    />
  );
}
