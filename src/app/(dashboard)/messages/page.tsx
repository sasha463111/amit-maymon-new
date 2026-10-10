import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyMessages } from '@/app/actions/caseNotes';
import { MessagesClient } from './MessagesClient';

export const dynamic = 'force-dynamic';

// "הודעות" — each person's inbox of notes/questions addressed to them, from
// every case, plus what they sent (Amit, 2026-10-10).
export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { inbox, sent, error } = await getMyMessages();
  return <MessagesClient inbox={inbox} sent={sent} error={error} />;
}
