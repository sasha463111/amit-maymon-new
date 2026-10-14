import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listCollectionCases } from '@/app/actions/collections';
import { LegalClient } from './LegalClient';

export const dynamic = 'force-dynamic';

const LEGAL_STAGES = ['טיפול משפטי', 'עובר לטיפול עו"ד'];

// "⚖️ טיפול משפטי" — its own screen (Amit, 2026-10-14). The rows are
// collection cases with status LEGAL (same table, same case file, same
// reports); opening here asks the same "existing case or a new accident"
// question by plate + accident date. Same access as collections.
export default async function LegalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  if (role !== 'COLLECTIONS' && role !== 'CEO' && role !== 'ACCOUNTANT') redirect('/');
  const { cases, collectors, isCeo, error } = await listCollectionCases();
  // Claims that BAFI marked as legal but were never moved (imported as open): offered for a move.
  const pending = cases.filter((c) => c.status !== 'LEGAL' && !c.legal_sent_on && !c.closed_at && LEGAL_STAGES.includes(c.claim_stage ?? ''));
  return <LegalClient cases={cases.filter((c) => c.status === 'LEGAL' || !!c.legal_sent_on)} pending={pending} collectors={collectors} isCeo={isCeo} error={error ?? null} />;
}
