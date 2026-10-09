'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { markRead, markUpdatesRead } from '@/app/actions/notifications';
import { ACTION_TYPES, ACTION_TYPE_SET } from '@/lib/notificationKinds';
import { PushSubscriber } from '@/components/PushSubscriber';
import { formatDate } from '@/lib/dates';

interface Row {
  id: string;
  type: string | null;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  case_id: string | null;
  action_url: string | null;
  triggered_by: string | null;
  // Joined
  license_plate: string | null;
  case_key: string | null;
  customer_name: string | null;
  triggered_by_name: string | null;
  /** An approval request whose approval is still PENDING. */
  awaiting: boolean;
}

const TYPE_ICON: Record<string, string> = {
  APPROVAL_REQUIRED: '✅',
  BLOCKED_ACTION: '⚠️',
  CEO_REJECTED: '❌',
  EXTRA_CREATED: '➕',
  EXTRA_STATUS_CHANGED: '🔄',
  APPROVAL_NEEDED: '📋',
  PENDING_APPROVAL: '⏳',
  DIRECT_NOTE: '💬',
  PAINTER_REQUEST: '🎨',
  PAINTER_READY_FOR_RELEASE: '✅',
  READY_FOR_OFFICE: '🏁',
  WASH_STARTED: '🧽',
  FINAL_ESTIMATE_UPLOADED: '⭐',
  OTHER: '🔔',
};

/** An approval request that is still waiting for a decision — the one kind
 *  of notification that needs the reader to act, not just know. Based on the
 *  approval itself, not on read state: Amit had 12 approvals waiting while
 *  every one of their notifications was already marked read. */
function needsMyApproval(n: { awaiting: boolean }): boolean {
  return n.awaiting;
}

/** Needs me: an approval still waiting, or an unread notification of an
 *  action type. Everything else is a plain update ("עדכונים שוטפים"). */
function isAction(n: Row): boolean {
  return n.awaiting || (!n.read && ACTION_TYPE_SET.has(n.type ?? ''));
}

function newestFirst(a: Row, b: Row): number {
  return b.created_at.localeCompare(a.created_at);
}

function getIcon(type: string | null): string {
  return (type && TYPE_ICON[type]) ?? '🔔';
}

function formatRelativeTime(s: string): string {
  const d = new Date(s);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} ד׳`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `לפני ${diffH} ש׳`;
  return formatDate(d);
}

export function NotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // null = pick automatically each time the bell opens: "לטיפול" when
  // something is waiting for me, otherwise the updates.
  const [tab, setTab] = useState<'action' | 'updates' | null>(null);
  useEffect(() => {
    if (!open) setTab(null);
  }, [open]);
  const lastNotificationIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load rows + unread count (joins case + plate + sender name)
  async function loadRows() {
    const supabase = createClient();
    const { data: notifData } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, created_at, case_id, action_url, triggered_by')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    type BaseRow = {
      id: string;
      type: string | null;
      title: string;
      body: string | null;
      read: boolean;
      created_at: string;
      case_id: string | null;
      action_url: string | null;
      triggered_by: string | null;
    };
    const list = (notifData ?? []) as BaseRow[];

    // Everything unread that needs me stays reachable even when it is older
    // than the latest 30, so it cannot fall off the bottom of "לטיפול".
    const { data: actionData } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, created_at, case_id, action_url, triggered_by')
      .eq('user_id', userId)
      .eq('read', false)
      .in('type', [...ACTION_TYPES])
      .order('created_at', { ascending: false })
      .limit(100);
    const haveIds = new Set(list.map((n) => n.id));
    for (const n of (actionData ?? []) as BaseRow[]) {
      if (!haveIds.has(n.id)) {
        haveIds.add(n.id);
        list.push(n);
      }
    }

    // Approvals still waiting (visible to CEO; empty for everyone else). Their
    // latest notification is always shown — even if older than the 15 above —
    // so nothing waiting for a decision can fall off the bottom of the list.
    const { data: pendingData } = await supabase.from('ceo_approvals').select('case_id').eq('status', 'PENDING');
    const pendingCaseIds = new Set(((pendingData ?? []) as { case_id: string }[]).map((p) => p.case_id));
    if (pendingCaseIds.size > 0) {
      const { data: approvalNotifs } = await supabase
        .from('notifications')
        .select('id, type, title, body, read, created_at, case_id, action_url, triggered_by')
        .eq('user_id', userId)
        .eq('type', 'PENDING_APPROVAL')
        .in('case_id', Array.from(pendingCaseIds))
        .order('created_at', { ascending: false })
        .limit(100);
      const shownCases = new Set(list.filter((n) => n.type === 'PENDING_APPROVAL').map((n) => n.case_id));
      for (const n of (approvalNotifs ?? []) as BaseRow[]) {
        if (n.case_id && !shownCases.has(n.case_id)) {
          shownCases.add(n.case_id);
          list.push(n);
        }
      }
    }

    const caseIds = Array.from(new Set(list.map((n) => n.case_id).filter((x): x is string => !!x)));
    const userIds = Array.from(new Set(list.map((n) => n.triggered_by).filter((x): x is string => !!x)));

    const plateMap = new Map<string, string>();
    const caseKeyMap = new Map<string, string>();
    const customerNameMap = new Map<string, string>();
    const userNameMap = new Map<string, string>();

    await Promise.all([
      (async () => {
        if (caseIds.length === 0) return;
        const { data: caseRows } = await supabase
          .from('cases')
          .select('id, case_key, customer_name, cars(license_plate)')
          .in('id', caseIds);
        for (const c of (caseRows ?? []) as Array<{ id: string; case_key: string | null; customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null }>) {
          const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
          if (car?.license_plate) plateMap.set(c.id, car.license_plate);
          if (c.case_key) caseKeyMap.set(c.id, c.case_key);
          if (c.customer_name) customerNameMap.set(c.id, c.customer_name);
        }
      })(),
      (async () => {
        if (userIds.length === 0) return;
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        for (const p of (profilesData ?? []) as Array<{ id: string; full_name: string | null }>) {
          if (p.full_name) userNameMap.set(p.id, p.full_name);
        }
      })(),
    ]);

    const enriched: Row[] = list.map((n) => ({
      ...n,
      license_plate: n.case_id ? plateMap.get(n.case_id) ?? null : null,
      case_key: n.case_id ? caseKeyMap.get(n.case_id) ?? null : null,
      customer_name: n.case_id ? customerNameMap.get(n.case_id) ?? null : null,
      triggered_by_name: n.triggered_by ? userNameMap.get(n.triggered_by) ?? null : null,
      awaiting: n.type === 'PENDING_APPROVAL' && !!n.case_id && pendingCaseIds.has(n.case_id),
    }));

    setRows(enriched);
    const unread = enriched.filter((n) => !n.read).length;
    setUnreadCount(unread);
    setLoaded(true);

    // PWA browser notification on a new unread arrival
    const newest = enriched.find((n) => !n.read);
    if (newest) {
      if (lastNotificationIdRef.current && newest.id !== lastNotificationIdRef.current) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(newest.title || 'התראה חדשה', {
            body: newest.body || undefined,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: newest.type || 'notification',
          });
        }
      }
      lastNotificationIdRef.current = newest.id;
    }
  }

  // Real-time: fire the instant a notification for me is inserted/updated.
  // Plus an immediate reload on app/tab focus (intervals are throttled while
  // backgrounded — the main cause of the "big delay") and a slow backstop poll.
  useEffect(() => {
    if (!userId) return;
    void loadRows();
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void loadRows())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void loadRows())
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') void loadRows(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const id = setInterval(() => void loadRows(), 20000);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleNotificationClick(n: Row) {
    setOpen(false);
    // Mark read optimistically; revert if the server call fails so the badge
    // doesn't lie about the unread count for a full poll cycle.
    if (!n.read) {
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: true } : r)));
      setUnreadCount((c) => Math.max(0, c - 1));
      // Refresh after the write so the case list's "N התראות לטיפול" and
      // yellow highlight drop this notification straight away.
      markRead(n.id).then(() => router.refresh()).catch((err) => {
        console.error('[NotificationsBell] markRead failed', err);
        setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: false } : r)));
        setUnreadCount((c) => c + 1);
      });
    }
    // Navigate. Approval-type notifications (and anything else with an
    // action_url that isn't itself a per-case deep link) go straight to that
    // URL — that's the whole point of clicking "אישור נדרש": land on the
    // approve/reject controls, not inside the case having to go find them.
    // Everything else routes through /go/{caseId}, which forwards each role
    // to a page it can actually open (painters → the painter view, everyone
    // else → the case detail) — a stored /painters/{id} is otherwise
    // unreachable for a service advisor and bounces them off the case.
    const isPerCaseUrl = n.action_url && (n.action_url.startsWith('/cases/') || n.action_url.startsWith('/painters/'));
    if (n.action_url && !isPerCaseUrl) router.push(n.action_url);
    else if (n.case_id) {
      // Preserve a query string (e.g. ?highlight=<id>) from the stored
      // per-case action_url — /go/[id]/page.tsx forwards it on to wherever
      // it lands the user, so a painter-request or workflow-step highlight
      // isn't lost just because it's routed through role-forwarding first.
      const qIndex = n.action_url?.indexOf('?') ?? -1;
      const qs = qIndex >= 0 ? n.action_url!.slice(qIndex) : '';
      router.push(`/go/${n.case_id}${qs}`);
    } else if (n.action_url) router.push(n.action_url);
  }

  // Header button on the "עדכונים שוטפים" tab: marks plain updates read and
  // leaves everything that needs action open.
  async function handleMarkUpdates() {
    if (updatesUnread === 0) return;
    setRows((prev) => prev.map((r) => (isAction(r) ? r : { ...r, read: true })));
    setUnreadCount((c) => Math.max(0, c - updatesUnread));
    await markUpdatesRead();
    router.refresh(); // clear the yellow case cards that only had updates
  }

  const actionRows = rows
    .filter(isAction)
    .sort((a, b) => Number(needsMyApproval(b)) - Number(needsMyApproval(a)) || newestFirst(a, b));
  const updateRows = rows.filter((n) => !isAction(n)).sort(newestFirst);
  const updatesUnread = updateRows.filter((n) => !n.read).length;
  const activeTab: 'action' | 'updates' = tab ?? (actionRows.length > 0 ? 'action' : 'updates');
  const shown = activeTab === 'action' ? actionRows : updateRows;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors"
        title="התראות"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={17} className="text-gray-500" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full border-2 border-white shadow-lg pointer-events-none"
            title={`${unreadCount} התראות לא נקראו`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] max-h-[480px] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
          role="dialog"
        >
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-800">התראות</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            {activeTab === 'updates' && updatesUnread > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkUpdates()}
                className="text-xs text-brand-red hover:text-brand-red-dark font-medium"
              >
                ✓ סמן עדכונים כנקראו
              </button>
            )}
          </div>

          {/* Tabs: what needs me vs. what just happened */}
          <div className="flex border-b border-gray-100 bg-white" role="tablist">
            {([
              ['action', 'לטיפול', actionRows.length, 'bg-orange-500 text-white'],
              ['updates', 'עדכונים שוטפים', updatesUnread, 'bg-gray-200 text-gray-700'],
            ] as const).map(([key, label, count, chip]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-brand-red text-gray-900 font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${chip}`}>{count}</span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {!loaded ? (
              <div className="p-6 text-center text-sm text-gray-400">טוען...</div>
            ) : shown.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-3xl mb-2">{activeTab === 'action' ? '✅' : '🔔'}</div>
                <p className="text-sm text-gray-500">
                  {activeTab === 'action' ? 'אין התראות שממתינות לטיפולך' : 'אין עדכונים'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {/* Amit (2026-10-07): approvals waiting for him must stand out
                    from plain updates at a glance — unread ones are pinned to
                    the top and drawn orange with a "ממתין לאישורך" tag. */}
                {shown.map((n) => {
                  const clickable = !!(n.action_url || n.case_id);
                  const approval = needsMyApproval(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void handleNotificationClick(n)}
                        disabled={!clickable}
                        className={`w-full text-right p-3 transition-colors flex gap-2.5 ${
                          clickable ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                        } ${approval ? 'bg-orange-100 border-r-4 border-orange-500 hover:bg-orange-200' : !n.read ? 'bg-red-50/30' : ''}`}
                      >
                        <div className="text-xl shrink-0 leading-none mt-0.5">{getIcon(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          {approval && (
                            <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-[11px] font-bold">
                              ⏳ ממתין לאישורך
                            </span>
                          )}
                          {/* Plate badge + customer name + title */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            {n.license_plate && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] font-bold tracking-wide" dir="ltr">
                                🚗 {n.license_plate}
                              </span>
                            )}
                            {n.customer_name && (
                              <span className="text-[11px] font-semibold text-gray-700 truncate max-w-[120px]">
                                {n.customer_name}
                              </span>
                            )}
                            {n.case_key && !n.license_plate && !n.customer_name && (
                              <span className="text-[10px] font-bold text-gray-600">{n.case_key}</span>
                            )}
                            <span className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              {n.title}
                            </span>
                          </div>
                          {n.body && (
                            <p className="text-xs text-gray-600 leading-snug truncate">{n.body}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                            <span>{formatRelativeTime(n.created_at)}</span>
                            {n.triggered_by_name && (
                              <>
                                <span>·</span>
                                <span className="text-gray-500">{n.triggered_by_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-2" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Push subscribe banner */}
          <PushSubscriber />

          {/* Footer */}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-semibold text-brand-red hover:text-brand-red-dark py-2.5 border-t border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            ראה את כל ההתראות ←
          </Link>
        </div>
      )}
    </div>
  );
}
