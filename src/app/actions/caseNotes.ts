'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/app/actions/push';

// Free-text notes on a case, addressed to chosen people (requested for the
// closure page by אילנה, 2026-10-07: "לעמית — הערה ספציפית, לנסיה וערן —
// הערה ספציפית"). Each note is delivered as a notification of type
// DIRECT_NOTE to exactly the chosen recipients: the DB fan-out trigger
// skips this type, so a note for Eran does not also land with Nesia. A CEO
// recipient gets push + email through trg_dispatch_ceo_push like any other
// notification; everyone else is pushed from here.

const NOTE_TYPE = 'DIRECT_NOTE';
// Only real staff are offered as recipients — the database also holds test
// and developer accounts, which must never receive notes.
const STAFF_EMAIL_DOMAIN = '@toyota-tehila.co.il';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type NoteRecipient = { id: string; name: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  CEO: 'מנכ"ל',
  SERVICE_MANAGER: 'מנהל שירות',
  SERVICE_ADVISOR: 'יועצת',
  OFFICE: 'משרד',
  PAINTER: 'פחחות',
};

async function staffList(): Promise<NoteRecipient[]> {
  const db = serviceClient();
  if (!db) return [];
  const [{ data: profiles }, { data: usersPage }] = await Promise.all([
    db.from('profiles').select('id, full_name, role').eq('is_active', true),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, (u.email ?? '').toLowerCase()]));
  return ((profiles ?? []) as { id: string; full_name: string | null; role: string }[])
    .filter((p) => (emailById.get(p.id) ?? '').endsWith(STAFF_EMAIL_DOMAIN))
    .map((p) => ({ id: p.id, name: p.full_name || '—', role: ROLE_LABEL[p.role] ?? p.role }))
    .sort((a, b) => a.role.localeCompare(b.role, 'he') || a.name.localeCompare(b.name, 'he'));
}

/** Can the signed-in user see this case? RLS on cases decides. */
async function userCanSeeCase(supabase: Awaited<ReturnType<typeof createClient>>, caseId: string) {
  const { data } = await supabase.from('cases').select('id').eq('id', caseId).maybeSingle();
  return !!data;
}

export async function getNoteRecipients(): Promise<{ recipients: NoteRecipient[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { recipients: [], error: 'לא מחובר' };
  const all = await staffList();
  return { recipients: all.filter((r) => r.id !== user.id) };
}

export type SentNote = { at: string; from: string; to: string[]; text: string };

export async function getCaseNotes(caseId: string): Promise<{ notes: SentNote[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notes: [], error: 'לא מחובר' };
  if (!(await userCanSeeCase(supabase, caseId))) return { notes: [], error: 'אין גישה לתיק' };

  // Recipients' rows are invisible to the sender under RLS, so the history
  // is read with the service client — only after the access check above.
  const db = serviceClient();
  if (!db) return { notes: [], error: 'שרת לא מוגדר' };
  const { data, error } = await db
    .from('notifications')
    .select('user_id, triggered_by, body, created_at')
    .eq('case_id', caseId)
    .eq('type', NOTE_TYPE)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return { notes: [], error: error.message };

  const rows = (data ?? []) as { user_id: string; triggered_by: string | null; body: string | null; created_at: string }[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.user_id, r.triggered_by]).filter((x): x is string => !!x)));
  const { data: names } = ids.length
    ? await db.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] };
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name || '—']));

  // One note = all rows written in the same insert (same sender, text, time).
  const grouped = new Map<string, SentNote>();
  for (const r of rows) {
    const key = `${r.triggered_by}|${r.created_at}|${r.body}`;
    const g = grouped.get(key) ?? { at: r.created_at, from: nameById.get(r.triggered_by ?? '') ?? '—', to: [], text: r.body ?? '' };
    g.to.push(nameById.get(r.user_id) ?? '—');
    grouped.set(key, g);
  }
  return { notes: Array.from(grouped.values()).slice(0, 50) };
}

export async function sendCaseNote(caseId: string, recipientIds: string[], text: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const body = text.trim();
  if (!body) return { error: 'נא לכתוב הערה' };
  if (body.length > 2000) return { error: 'ההערה ארוכה מדי' };
  if (!(await userCanSeeCase(supabase, caseId))) return { error: 'אין גישה לתיק' };

  const allowed = new Map((await staffList()).map((r) => [r.id, r]));
  const targets = Array.from(new Set(recipientIds)).filter((id) => allowed.has(id) && id !== user.id);
  if (targets.length === 0) return { error: 'נא לבחור למי לשלוח' };

  const { data: me } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const senderName = (me as { full_name: string | null } | null)?.full_name || 'משתמש';
  const title = `💬 הערה מ${senderName}`;

  // One insert for all recipients, so every row shares the same created_at
  // and the history can group them back into a single note.
  const { error } = await supabase.from('notifications').insert(
    targets.map((id) => ({
      user_id: id,
      case_id: caseId,
      type: NOTE_TYPE,
      title,
      body,
      action_url: `/go/${caseId}`,
      triggered_by: user.id,
      read: false,
    })) as never,
  );
  if (error) return { error: error.message };

  // Push for non-CEO recipients; CEO pushes come from the DB dispatcher and
  // sendPushToUser skips them here, so nobody is pushed twice.
  await Promise.all(targets.map((id) => sendPushToUser(id, { title, body, url: `/go/${caseId}`, tag: `note-${caseId}` })));

  revalidatePath(`/closure/${caseId}`);
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, sent: targets.length };
}
