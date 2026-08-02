'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { markRead, markAllRead } from '@/app/actions/notifications';
import { PushSubscriber } from '@/components/PushSubscriber';
import { LicensePlate } from '@/components/ui/LicensePlate';

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
}

const TYPE_ICON: Record<string, string> = {
  APPROVAL_REQUIRED: '✅',
  BLOCKED_ACTION: '⚠️',
  CEO_REJECTED: '❌',
  EXTRA_CREATED: '➕',
  EXTRA_STATUS_CHANGED: '🔄',
  APPROVAL_NEEDED: '📋',
  PENDING_APPROVAL: '⏳',
  PAINTER_REQUEST: '🎨',
  PAINTER_READY_FOR_RELEASE: '✅',
  READY_FOR_OFFICE: '🏁',
  WASH_STARTED: '🧽',
  FINAL_ESTIMATE_UPLOADED: '⭐',
  OTHER: '🔔',
};

function getIcon(type: string | null): string {
  return (type && TYPE_ICON[type]) ?? '🔔';
}

// Semantic color per notification type: red = blocked/rejected, amber = needs
// your action, green = positive/done, blue = neutral update, gray = other.
const TYPE_COLOR: Record<string, string> = {
  BLOCKED_ACTION: 'bg-red-100 text-red-700',
  CEO_REJECTED: 'bg-red-100 text-red-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  PAINTER_REQUEST: 'bg-amber-100 text-amber-700',
  APPROVAL_NEEDED: 'bg-amber-100 text-amber-700',
  EXTRA_CREATED: 'bg-amber-100 text-amber-700',
  READY_FOR_OFFICE: 'bg-green-100 text-green-700',
  PAINTER_READY_FOR_RELEASE: 'bg-green-100 text-green-700',
  FINAL_ESTIMATE_UPLOADED: 'bg-green-100 text-green-700',
  WASH_STARTED: 'bg-blue-100 text-blue-700',
  EXTRA_STATUS_CHANGED: 'bg-blue-100 text-blue-700',
};

function getTypeColor(type: string | null): string {
  return (type && TYPE_COLOR[type]) ?? 'bg-gray-100 text-gray-500';
}

function formatDate(s: string): string {
  const d = new Date(s);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} ד׳`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `לפני ${diffH} ש׳`;
  return d.toLocaleDateString('he-IL');
}

export function NotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
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
      .limit(15);

    const list = (notifData ?? []) as Array<{
      id: string;
      type: string | null;
      title: string;
      body: string | null;
      read: boolean;
      created_at: string;
      case_id: string | null;
      action_url: string | null;
      triggered_by: string | null;
    }>;

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

  // Realtime push (instant) + 10s poll as a fallback in case the realtime
  // socket drops or the table isn't in the realtime publication.
  useEffect(() => {
    if (!userId) return;
    void loadRows();
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-bell-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void loadRows()
      )
      .subscribe();

    const id = setInterval(() => void loadRows(), 10000);
    return () => {
      clearInterval(id);
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
      markRead(n.id).catch((err) => {
        console.error('[NotificationsBell] markRead failed', err);
        setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: false } : r)));
        setUnreadCount((c) => c + 1);
      });
    }
    // Navigate: prefer action_url; fall back to /cases/{id}
    if (n.action_url) router.push(n.action_url);
    else if (n.case_id) router.push(`/cases/${n.case_id}`);
  }

  async function handleMarkAll() {
    if (unreadCount === 0) return;
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    setUnreadCount(0);
    await markAllRead();
  }

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
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="text-xs text-brand-red hover:text-brand-red-dark font-medium"
              >
                ✓ סמן הכל כנקרא
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {!loaded ? (
              <div className="p-6 text-center text-sm text-gray-400">טוען...</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm text-gray-500">אין התראות</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((n) => {
                  const clickable = !!(n.action_url || n.case_id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void handleNotificationClick(n)}
                        disabled={!clickable}
                        className={`w-full text-right p-3 transition-colors flex gap-2.5 ${
                          clickable ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                        } ${!n.read ? 'bg-red-50/30' : ''}`}
                      >
                        <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base leading-none ${getTypeColor(n.type)}`}>
                          {getIcon(n.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Plate badge + customer name + title */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <LicensePlate plate={n.license_plate} size="sm" />
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
                            <span>{formatDate(n.created_at)}</span>
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
