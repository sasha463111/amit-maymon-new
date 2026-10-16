import 'server-only';
import { db, graphGet, outlookConfigured } from '@/lib/outlook.server';
import { platesIn } from '@/lib/outlook';

// 📧 Mail watch (16/10) — run by the reminders cron every 30 min, for every
// connected mailbox:
//  1. a reply in a conversation we sent with "⏰ תזכיר לי אם לא ענו" → the
//     follow-up is done (a claim's reminder is cancelled + "📧 התקבלה תשובה");
//  2. a new email that mentions the plate of an OPEN claim / repair case the
//     user works on (not yet attached) → a note "📧 מייל על …" that opens it;
//  3. the inbox unread count, for the "📧 דואר" badge;
// and, for repair cases / referrals, a follow-up that is due → "⏰ לא התקבלה תשובה".

type Msg = { id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; conversationId?: string; internetMessageId?: string; from?: { emailAddress?: { name?: string; address?: string } } };

export async function runMailWatch(): Promise<Record<string, unknown>> {
  if (!outlookConfigured()) return { skipped: 'not configured' };
  const d = db();
  if (!d) return { error: 'no service client' };
  const { data: conns } = await d.from('ms_connections').select('user_id, last_mail_check_at');
  let checked = 0;
  let alerts = 0;
  let replies = 0;
  for (const conn of (conns ?? []) as { user_id: string; last_mail_check_at: string | null }[]) {
    const startedAt = new Date().toISOString();
    const since = conn.last_mail_check_at ?? new Date(Date.now() - 2 * 3600_000).toISOString();
    const r = await graphGet<{ value: Msg[] }>(conn.user_id, `/me/mailFolders/inbox/messages?$top=50&$select=id,subject,bodyPreview,from,receivedDateTime,conversationId,internetMessageId&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc`);
    if (!r.ok) continue; // revoked / expired: the user reconnects in /mail
    checked++;
    const msgs = r.data.value;

    // 1) replies → follow-ups done
    const convs = Array.from(new Set(msgs.map((m) => m.conversationId).filter((x): x is string => !!x)));
    if (convs.length) {
      const { data: open } = await d.from('case_emails').select('id, target_type, target_id, subject, follow_up_event, conversation_id').eq('follow_up_user', conn.user_id).eq('direction', 'OUT').is('follow_up_done_at', null).in('conversation_id', convs);
      for (const f of (open ?? []) as { id: string; target_type: string; target_id: string; subject: string | null; follow_up_event: string | null; conversation_id: string }[]) {
        await d.from('case_emails').update({ follow_up_done_at: new Date().toISOString() } as never).eq('id', f.id);
        if (f.follow_up_event) {
          await d.from('collection_case_events').update({ remind_done_at: new Date().toISOString() } as never).eq('id', f.follow_up_event).is('remind_done_at', null);
          const reply = msgs.find((m) => m.conversationId === f.conversation_id);
          await d.from('collection_case_events').insert({ case_id: f.target_id, kind: 'EMAIL', body: `📧 התקבלה תשובה: ${(reply?.subject ?? f.subject ?? '').slice(0, 150)}${reply?.from?.emailAddress?.name ? ` (מאת ${reply.from.emailAddress.name})` : ''}`, created_by: conn.user_id } as never);
        }
        replies++;
      }
    }

    // 2) new email about an open case → a note
    const { data: prof } = await d.from('profiles').select('role, branch_ids, collections_manager').eq('id', conn.user_id).maybeSingle();
    const p = prof as { role: string; branch_ids: string[] | null; collections_manager: boolean | null } | null;
    const supervisor = p?.role === 'CEO' || p?.role === 'ACCOUNTANT' || (p?.role === 'COLLECTIONS' && !!p?.collections_manager);
    for (const m of msgs) {
      const plates = platesIn(`${m.subject ?? ''} ${m.bodyPreview ?? ''}`);
      if (!plates.length) continue;
      if (m.internetMessageId) {
        const { count } = await d.from('case_emails').select('id', { count: 'exact', head: true }).eq('internet_message_id', m.internetMessageId);
        if (count) continue;
      }
      let label: string | null = null;
      if (['COLLECTIONS', 'CEO', 'ACCOUNTANT'].includes(p?.role ?? '')) {
        let q = d.from('collection_cases').select('customer_name, plate').in('plate', plates).is('closed_at', null).limit(1);
        if (!supervisor) q = q.eq('assigned_to', conn.user_id);
        const { data: cc } = await q;
        const hit = (cc ?? [])[0] as { customer_name: string | null; plate: string } | undefined;
        if (hit) label = `תביעה · ${hit.customer_name ?? hit.plate}`;
      }
      if (!label) {
        let q = d.from('cases').select('customer_name, branch_id, cars!inner(license_plate)').in('cars.license_plate', plates).is('closed_at', null).is('deleted_at', null).limit(1);
        if (p?.role !== 'CEO') q = q.in('branch_id', p?.branch_ids?.length ? p.branch_ids : ['00000000-0000-0000-0000-000000000000']);
        const { data: cs } = await q;
        const hit = (cs ?? [])[0] as { customer_name: string | null } | undefined;
        if (hit) label = `תיק · ${hit.customer_name ?? plates[0]}`;
      }
      if (!label) continue;
      await d.from('notifications').insert({
        user_id: conn.user_id,
        type: 'DIRECT_NOTE',
        title: `📧 מייל על ${label}`,
        body: `${m.from?.emailAddress?.name || m.from?.emailAddress?.address || ''} · ${(m.subject ?? '').slice(0, 150)}`.slice(0, 300),
        action_url: `/mail?open=${encodeURIComponent(m.id)}`,
      } as never);
      alerts++;
    }

    // 3) unread count for the badge
    const u = await graphGet<{ unreadItemCount?: number }>(conn.user_id, '/me/mailFolders/inbox?$select=unreadItemCount');
    await d.from('ms_connections').update({ last_mail_check_at: startedAt, ...(u.ok ? { unread_count: u.data.unreadItemCount ?? 0 } : {}) } as never).eq('user_id', conn.user_id);
  }

  // Repair cases / referrals: a follow-up that came due without a reply.
  const { data: due } = await d.from('case_emails').select('id, target_type, target_id, subject, follow_up_user').lte('follow_up_at', new Date().toISOString()).is('follow_up_done_at', null).is('follow_up_sent_at', null).is('follow_up_event', null).not('follow_up_user', 'is', null).limit(100);
  let followUps = 0;
  for (const f of (due ?? []) as { id: string; target_type: string; target_id: string; subject: string | null; follow_up_user: string }[]) {
    const { data: claimed } = await d.from('case_emails').update({ follow_up_sent_at: new Date().toISOString() } as never).eq('id', f.id).is('follow_up_sent_at', null).select('id');
    if (!claimed || (claimed as unknown[]).length === 0) continue;
    await d.from('notifications').insert({
      user_id: f.follow_up_user,
      type: 'DIRECT_NOTE',
      title: '⏰ לא התקבלה תשובה למייל',
      body: (f.subject ?? '').slice(0, 300),
      action_url: f.target_type === 'CASE' ? `/cases/${f.target_id}` : `/referrals/${f.target_id}`,
    } as never);
    followUps++;
  }
  return { checked, alerts, replies, followUps };
}
