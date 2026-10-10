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

  // A note is private to its sender and recipients: each user sees only the
  // notes they sent or received. The CEO sees all of them (his standing
  // request to see everything that happens in the system).
  const { data: meRow } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isCeo = (meRow as { role: string } | null)?.role === 'CEO';
  const visibleKeys = new Set(
    rows.filter((r) => isCeo || r.user_id === user.id || r.triggered_by === user.id)
      .map((r) => `${r.triggered_by}|${r.created_at}|${r.body}`),
  );

  // One note = all rows written in the same insert (same sender, text, time).
  const grouped = new Map<string, SentNote>();
  for (const r of rows) {
    if (!visibleKeys.has(`${r.triggered_by}|${r.created_at}|${r.body}`)) continue;
    const key = `${r.triggered_by}|${r.created_at}|${r.body}`;
    const g = grouped.get(key) ?? { at: r.created_at, from: nameById.get(r.triggered_by ?? '') ?? '—', to: [], text: r.body ?? '' };
    g.to.push(nameById.get(r.user_id) ?? '—');
    grouped.set(key, g);
  }
  return { notes: Array.from(grouped.values()).slice(0, 50) };
}

/** Delivers one note/message: a DIRECT_NOTE row per recipient + push. With a
 *  case it opens the case; without one (a general message from the inbox) it
 *  opens the inbox. */
async function deliverNote(caseId: string | null, recipientIds: string[], text: string, reply = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const body = text.trim();
  if (!body) return { error: 'נא לכתוב הודעה' };
  if (body.length > 2000) return { error: 'ההודעה ארוכה מדי' };
  if (caseId && !(await userCanSeeCase(supabase, caseId))) return { error: 'אין גישה לתיק' };

  const allowed = new Map((await staffList()).map((r) => [r.id, r]));
  const targets = Array.from(new Set(recipientIds)).filter((id) => allowed.has(id) && id !== user.id);
  if (targets.length === 0) return { error: 'נא לבחור למי לשלוח' };

  const { data: me } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const senderName = (me as { full_name: string | null } | null)?.full_name || 'משתמש';
  const title = reply ? `↩️ תשובה מ${senderName}` : `💬 הערה מ${senderName}`;
  const url = caseId ? `/go/${caseId}` : '/messages';

  // One insert for all recipients, so every row shares the same created_at
  // and the history can group them back into a single note.
  const { error } = await supabase.from('notifications').insert(
    targets.map((id) => ({
      user_id: id,
      case_id: caseId,
      type: NOTE_TYPE,
      title,
      body,
      action_url: url,
      triggered_by: user.id,
      read: false,
    })) as never,
  );
  if (error) return { error: error.message };

  // Push for non-CEO recipients; CEO pushes come from the DB dispatcher and
  // sendPushToUser skips them here, so nobody is pushed twice.
  await Promise.all(targets.map((id) => sendPushToUser(id, { title, body, url, tag: `note-${caseId ?? 'general'}` })));

  if (caseId) {
    revalidatePath(`/closure/${caseId}`);
    revalidatePath(`/cases/${caseId}`);
  }
  revalidatePath('/messages');
  return { ok: true, sent: targets.length };
}

export async function sendCaseNote(caseId: string, recipientIds: string[], text: string) {
  return deliverNote(caseId, recipientIds, text);
}

// ---- Inbox ("הודעות"): Amit, 2026-10-10 — every person gets their notes and
// questions in one inbox, not only inside the case, so work talk moves from
// WhatsApp into the system. Same DIRECT_NOTE rows as the case notes above.

export type InboxMessage = {
  id: string;
  at: string;
  fromId: string | null;
  from: string;
  title: string;
  text: string;
  read: boolean;
  caseId: string | null;
  caseLabel: string | null;
};
export type OutboxMessage = {
  at: string;
  caseId: string | null;
  caseLabel: string | null;
  text: string;
  to: { name: string; read: boolean }[];
};

type NoteRow = { id: string; user_id: string; triggered_by: string | null; title: string; body: string | null; read: boolean; created_at: string; case_id: string | null };

export async function getMyMessages(): Promise<{ inbox: InboxMessage[]; sent: OutboxMessage[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { inbox: [], sent: [], error: 'לא מחובר' };
  const db = serviceClient();
  if (!db) return { inbox: [], sent: [], error: 'שרת לא מוגדר' };

  // Strictly the caller's own messages: received (user_id = me) and sent
  // (triggered_by = me). The service client is needed only to see the rows
  // of the people I sent to (whether they read them).
  const cols = 'id, user_id, triggered_by, title, body, read, created_at, case_id';
  const [inRes, outRes] = await Promise.all([
    db.from('notifications').select(cols).eq('type', NOTE_TYPE).eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
    db.from('notifications').select(cols).eq('type', NOTE_TYPE).eq('triggered_by', user.id).neq('user_id', user.id).order('created_at', { ascending: false }).limit(300),
  ]);
  if (inRes.error) return { inbox: [], sent: [], error: inRes.error.message };
  const inRows = (inRes.data ?? []) as NoteRow[];
  const outRows = (outRes.data ?? []) as NoteRow[];

  const all = [...inRows, ...outRows];
  const personIds = Array.from(new Set(all.flatMap((r) => [r.user_id, r.triggered_by]).filter((x): x is string => !!x)));
  const caseIds = Array.from(new Set(all.map((r) => r.case_id).filter((x): x is string => !!x)));
  const [{ data: names }, { data: cases }] = await Promise.all([
    personIds.length ? db.from('profiles').select('id, full_name').in('id', personIds) : Promise.resolve({ data: [] }),
    caseIds.length ? db.from('cases').select('id, customer_name, cars(license_plate)').in('id', caseIds) : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name || '—']));
  type CaseRow = { id: string; customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null };
  const caseLabel = new Map(
    ((cases ?? []) as CaseRow[]).map((c) => {
      const plate = Array.isArray(c.cars) ? c.cars[0]?.license_plate : c.cars?.license_plate;
      return [c.id, [plate, c.customer_name].filter(Boolean).join(' · ') || 'תיק'];
    }),
  );

  const inbox: InboxMessage[] = inRows.map((r) => ({
    id: r.id,
    at: r.created_at,
    fromId: r.triggered_by,
    from: nameById.get(r.triggered_by ?? '') ?? '—',
    title: r.title,
    text: r.body ?? '',
    read: r.read,
    caseId: r.case_id,
    caseLabel: r.case_id ? caseLabel.get(r.case_id) ?? 'תיק' : null,
  }));

  const grouped = new Map<string, OutboxMessage>();
  for (const r of outRows) {
    const key = `${r.created_at}|${r.case_id}|${r.body}`;
    const g = grouped.get(key) ?? {
      at: r.created_at,
      caseId: r.case_id,
      caseLabel: r.case_id ? caseLabel.get(r.case_id) ?? 'תיק' : null,
      text: r.body ?? '',
      to: [],
    };
    g.to.push({ name: nameById.get(r.user_id) ?? '—', read: r.read });
    grouped.set(key, g);
  }
  return { inbox, sent: Array.from(grouped.values()).slice(0, 100) };
}

/** A new message from the inbox, not tied to a case. */
export async function sendGeneralMessage(recipientIds: string[], text: string) {
  return deliverNote(null, recipientIds, text);
}

/** Reply to a received message: goes back to its sender, on the same case
 *  (if any), and marks the original as read. */
export async function replyToMessage(messageId: string, text: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { data } = await supabase
    .from('notifications')
    .select('id, triggered_by, case_id')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .maybeSingle();
  const orig = data as { id: string; triggered_by: string | null; case_id: string | null } | null;
  if (!orig?.triggered_by) return { error: 'ההודעה לא נמצאה' };
  const res = await deliverNote(orig.case_id, [orig.triggered_by], text, true);
  if ('ok' in res) await supabase.from('notifications').update({ read: true } as never).eq('id', orig.id).eq('user_id', user.id);
  return res;
}
