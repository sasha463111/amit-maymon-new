import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listCollectionCases, listShirBatch } from '@/app/actions/collections';
import { getWeeklySummary, listBetaFeedback, listMyReminders } from '@/app/actions/collectionFile';
import { CollectionsClient } from './CollectionsClient';

export const dynamic = 'force-dynamic';

// "גבייה" — collection cases per collector (Amit, 2026-10-14). Collectors see
// their own cases; the CEO sees all, per collector. Each row opens the case
// file (/collections/[id]); my open reminders are listed on top.
export default async function CollectionsPage(props: { searchParams?: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  if (role !== 'COLLECTIONS' && role !== 'CEO' && role !== 'ACCOUNTANT') redirect('/');
  const [{ cases, collectors, terms, isCeo, canEditTerms, error }, shir, reminders, feedback, weekly] = await Promise.all([listCollectionCases(), listShirBatch(), listMyReminders(), listBetaFeedback(), getWeeklySummary()]);
  return (
    <CollectionsClient
      cases={cases}
      collectors={collectors}
      terms={terms}
      isCeo={isCeo}
      canEditTerms={canEditTerms}
      shir={shir.invoices}
      reminders={reminders}
      feedback={feedback}
      weekly={weekly}
      initialTab={searchParams?.tab}
      error={error ?? shir.error ?? null}
    />
  );
}
