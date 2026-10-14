import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listCollections } from '@/app/actions/collections';
import { CollectionsClient } from './CollectionsClient';

export const dynamic = 'force-dynamic';

// "גבייה" — claims collectors + CEO (Amit, 2026-10-14). First version; Amit's
// bookkeeper is writing the full spec.
export default async function CollectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  if (role !== 'COLLECTIONS' && role !== 'CEO') redirect('/');
  const { rows, terms, canEditTerms, error } = await listCollections();
  return <CollectionsClient rows={rows} terms={terms} canEditTerms={canEditTerms} error={error ?? null} />;
}
