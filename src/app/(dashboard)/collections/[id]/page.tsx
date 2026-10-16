import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCollectionFile } from '@/app/actions/collectionFile';
import { CaseFileClient } from './CaseFileClient';
import { listCaseEmails, outlookStatus } from '@/app/actions/outlook';
import { MAIL_API } from '../../mail/api';
import { canUseOutlook } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

// The collection case file (Amit, 2026-10-14): everything about one claim in
// one place — the running log with reminders, claim details, appraiser,
// third party, contacts, documents, status and payment.
export default async function CollectionCasePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const r = await getCollectionFile(params.id);
  if (!r.c) {
    return (
      <div className="max-w-xl mx-auto py-10 text-center space-y-3" dir="rtl">
        <p className="text-gray-700">{r.error ?? 'התיק לא נמצא'}</p>
        <Link href="/collections" className="text-indigo-700 font-semibold">→ חזרה לניהול תביעות ביטוח</Link>
      </div>
    );
  }
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const mail = canUseOutlook((prof as { role: string } | null)?.role);
  const ms = mail ? await outlookStatus() : null;
  return <CaseFileClient c={r.c} events={r.events} files={r.files} repairCaseId={r.repairCaseId} terms={r.terms} supervisor={r.supervisor} collectors={r.collectors} shortcuts={r.shortcuts} mailLoad={mail ? listCaseEmails : undefined} mailCompose={ms ? { api: MAIL_API, status: { configured: ms.configured, connected: ms.connected } } : undefined} />;
}
