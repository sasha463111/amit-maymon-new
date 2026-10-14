import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCollectionFile } from '@/app/actions/collectionFile';
import { LetterClient } from './LetterClient';

export const dynamic = 'force-dynamic';

// Payment demand letter (Amit approved, 14/10): built from the case data,
// printed / saved as PDF, opened in the mail app, marked as sent.
export default async function CollectionLetterPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const r = await getCollectionFile(params.id);
  if (!r.c) {
    return (
      <div className="max-w-xl mx-auto py-10 text-center space-y-3" dir="rtl">
        <p className="text-gray-700">{r.error ?? 'התיק לא נמצא'}</p>
        <a href="/collections" className="text-indigo-700 font-semibold">→ חזרה לניהול תביעות ביטוח</a>
      </div>
    );
  }
  const { data: me } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  return <LetterClient c={r.c} senderName={(me as { full_name: string | null } | null)?.full_name ?? ''} />;
}
