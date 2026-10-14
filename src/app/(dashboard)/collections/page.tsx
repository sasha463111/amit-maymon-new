import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listCollectionCases } from '@/app/actions/collections';
import { CollectionsClient } from './CollectionsClient';

export const dynamic = 'force-dynamic';

// "גבייה" — collection cases per collector (Amit, 2026-10-14). Collectors see
// their own cases; the CEO sees all, per collector.
export default async function CollectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  if (role !== 'COLLECTIONS' && role !== 'CEO' && role !== 'ACCOUNTANT') redirect('/');
  const { cases, collectors, terms, isCeo, canEditTerms, error } = await listCollectionCases();
  return <CollectionsClient cases={cases} collectors={collectors} terms={terms} isCeo={isCeo} canEditTerms={canEditTerms} error={error ?? null} />;
}
