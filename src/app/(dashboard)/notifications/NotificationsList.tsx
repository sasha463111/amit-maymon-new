'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markRead, markAllRead, markManyRead } from '@/app/actions/notifications';
import { useRemembered } from '@/lib/useRemembered';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { formatDate } from '@/lib/dates';

interface NotificationRow {
  id: string;
  type: string | null;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  case_id: string | null;
  license_plate: string | null;
  /** "טויוטה C-HR HYBRID" next to the plate (Amit, 2026-10-13). */
  vehicle?: string | null;
  action_url: string | null;
  triggered_by_name: string | null;
  /** Approval request whose approval is still PENDING. */
  awaiting?: boolean;
}

const TYPE_ICON: Record<string, string> = {
  APPROVAL_REQUIRED: '✅',
  BLOCKER: '⚠️',
  WORKFLOW: '📋',
  CASE_CLOSED: '🏁',
  PARTS_UPDATE: '📦',
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

function getTypeIcon(type: string | null): string {
  return (type && TYPE_ICON[type]) ?? '🔔';
}

// Semantic color per notification type: red = blocked/rejected, amber = needs
// your action, green = positive/done, blue = neutral update, gray = other.
const TYPE_COLOR: Record<string, string> = {
  BLOCKER: 'bg-red-100 text-red-700',
  BLOCKED_ACTION: 'bg-red-100 text-red-700',
  CEO_REJECTED: 'bg-red-100 text-red-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  DIRECT_NOTE: 'bg-indigo-100 text-indigo-700',
  PAINTER_REQUEST: 'bg-amber-100 text-amber-700',
  APPROVAL_NEEDED: 'bg-amber-100 text-amber-700',
  EXTRA_CREATED: 'bg-amber-100 text-amber-700',
  READY_FOR_OFFICE: 'bg-green-100 text-green-700',
  PAINTER_READY_FOR_RELEASE: 'bg-green-100 text-green-700',
  FINAL_ESTIMATE_UPLOADED: 'bg-green-100 text-green-700',
  CASE_CLOSED: 'bg-green-100 text-green-700',
  WASH_STARTED: 'bg-blue-100 text-blue-700',
  EXTRA_STATUS_CHANGED: 'bg-blue-100 text-blue-700',
  WORKFLOW: 'bg-blue-100 text-blue-700',
  PARTS_UPDATE: 'bg-blue-100 text-blue-700',
};

function getTypeColor(type: string | null): string {
  return (type && TYPE_COLOR[type]) ?? 'bg-gray-100 text-gray-500';
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  const timeStr = date.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });

  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} דקות — ${timeStr}`;
  if (diffHour < 24) return `לפני ${diffHour} שעות — ${timeStr}`;
  if (diffDay < 7) return `${formatDate(date)} ${timeStr}`;
  return `${formatDate(date)} ${timeStr}`;
}

function NotificationItem({
  n,
  onNavigate,
  onMarkRead,
}: {
  n: NotificationRow;
  onNavigate: (n: NotificationRow) => void;
  onMarkRead: (id: string) => void;
}) {
  const isClickable = !!(n.action_url || n.case_id);
  return (
    <div
      onClick={() => onNavigate(n)}
      className={`rounded-xl border shadow-sm p-4 flex gap-3 transition-all hover:shadow-md ${
        isClickable ? 'cursor-pointer hover:border-brand-red/30' : ''
      } ${
        // Approval waiting for me: orange + tag, so it can't be mistaken for
        // a plain update (Amit, 2026-10-07).
        n.awaiting
          ? 'border-orange-400 border-r-4 bg-orange-100'
          : !n.read ? 'border-brand-red/20 bg-red-50/20' : 'border-gray-200 bg-white'
      }`}
    >
      <div className={`w-10 h-10 mt-0.5 shrink-0 rounded-full flex items-center justify-center text-lg leading-none ${getTypeColor(n.type)}`}>
        {getTypeIcon(n.type)}
      </div>
      <div className="flex-1 min-w-0">
        {n.awaiting && (
          <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-[11px] font-bold">
            ⏳ ממתין לאישורך
          </span>
        )}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <LicensePlate plate={n.license_plate} size="sm" />
          {n.vehicle && <span className="text-xs font-semibold text-gray-600" dir="auto">{n.vehicle}</span>}
          <p
            className={`text-sm leading-snug ${
              !n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'
            }`}
          >
            {n.title}
          </p>
        </div>
        {n.body && (
          <p className="text-sm text-gray-500 mt-0.5 leading-snug">{n.body}</p>
        )}
        {n.triggered_by_name && (
          <p className="text-xs text-gray-500 mt-1">
            <span className="text-gray-400">נשלח על ידי:</span>{' '}
            <span className="font-medium text-gray-700">{n.triggered_by_name}</span>
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <p className="text-xs text-gray-400">{formatRelativeTime(n.created_at)}</p>
          {isClickable && (
            <span className="text-xs text-brand-red font-medium">← פתח</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {!n.read && (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-brand-red" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
              className="text-xs text-brand-red hover:text-brand-red-dark font-medium transition-colors whitespace-nowrap"
            >
              סמן נקרא
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function NotificationsList({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  const router = useRouter();
  // 16/10 (UI round): "רק חדשות" filter (remembered), per-car "סמן כנקרא",
  // and cars with nothing new stay folded until opened.
  const [show, setShow] = useRemembered<'all' | 'new'>('notifications-show', 'all', (v) => v === 'all' || v === 'new');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [busyGroup, setBusyGroup] = useState<string | null>(null);

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🔔</div>
        <p className="text-gray-500 font-medium">אין התראות</p>
        <p className="text-gray-400 text-sm mt-1">כשיהיו עדכונים חדשים הם יופיעו כאן</p>
      </div>
    );
  }

  async function handleClick(n: NotificationRow) {
    if (!n.read) {
      await markRead(n.id);
      router.refresh();
    }
    // A per-case action_url (/cases/{id}, /painters/{id}) needs role-aware
    // forwarding — a painter hitting /cases/{id} directly gets bounced, same
    // problem /go/{id} exists to solve (see its own comment). Anything else
    // (e.g. /approvals) is a general page every recipient can open, so it
    // wins outright — that's the whole point of an approval notification.
    const isPerCaseUrl = n.action_url && (n.action_url.startsWith('/cases/') || n.action_url.startsWith('/painters/'));
    if (n.action_url && !isPerCaseUrl) router.push(n.action_url);
    else if (n.case_id) {
      // Preserve a query string (e.g. ?highlight=<id>) from the stored
      // per-case action_url through /go/'s role-forwarding.
      const qIndex = n.action_url?.indexOf('?') ?? -1;
      const qs = qIndex >= 0 ? n.action_url!.slice(qIndex) : '';
      router.push(`/go/${n.case_id}${qs}`);
    } else if (n.action_url) router.push(n.action_url);
  }

  async function handleMarkRead(id: string) {
    await markRead(id);
    router.refresh();
  }

  // Group by case_id — notifications without a case go last under "כללי"
  const groups = new Map<string, { plate: string | null; vehicle: string | null; items: NotificationRow[] }>();
  const ungrouped: NotificationRow[] = [];

  const visible = show === 'new' ? notifications.filter((n) => !n.read) : notifications;
  for (const n of visible) {
    if (n.case_id) {
      if (!groups.has(n.case_id)) {
        groups.set(n.case_id, { plate: n.license_plate, vehicle: n.vehicle ?? null, items: [] });
      }
      groups.get(n.case_id)!.items.push(n);
    } else {
      ungrouped.push(n);
    }
  }

  // Sort groups by most recent notification
  const sortedGroups = Array.from(groups.entries()).sort(([, a], [, b]) => {
    const latestA = a.items[0]?.created_at ?? '';
    const latestB = b.items[0]?.created_at ?? '';
    return latestB.localeCompare(latestA);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden text-sm" role="group" aria-label="סינון התראות">
          {([['all', 'הכל'], ['new', `רק חדשות (${unreadCount})`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setShow(k)} aria-pressed={show === k} className={`h-9 px-3 font-semibold ${show === k ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={async () => { await markAllRead(); router.refresh(); }}
            className="text-sm text-brand-red hover:text-brand-red-dark font-medium flex items-center gap-1 transition-colors"
          >
            ✓ סמן הכל כנקרא
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          <div className="text-4xl mb-2">✅</div>
          אין התראות חדשות
        </div>
      )}

      {/* Groups per vehicle */}
      {sortedGroups.map(([caseId, group]) => {
        const unreadIds = group.items.filter((n) => !n.read).map((n) => n.id);
        const hasUnread = unreadIds.length > 0;
        const expanded = hasUnread || opened.has(caseId);
        return (
          <div key={caseId} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Group header */}
            <div
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                hasUnread ? 'bg-red-50/30 border-b border-brand-red/10' : 'bg-gray-50 border-b border-gray-100'
              }`}
              onClick={() => router.push(`/go/${caseId}`)}
            >
              {group.plate ? (
                <span className="flex items-center gap-2 min-w-0">
                  <LicensePlate plate={group.plate} size="sm" />
                  {group.vehicle && <span className="text-sm font-bold text-gray-700 truncate" dir="auto">{group.vehicle}</span>}
                </span>
              ) : (
                <span className="font-bold text-gray-800 text-sm">רכב לא ידוע</span>
              )}
              <span className="mr-auto text-xs text-gray-400">
                {group.items.length} התראות
              </span>
              {hasUnread && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-red text-white text-[10px] font-bold">
                  {unreadIds.length} חדשות
                </span>
              )}
              {hasUnread ? (
                <button
                  type="button"
                  disabled={busyGroup === caseId}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setBusyGroup(caseId);
                    await markManyRead(unreadIds);
                    setBusyGroup(null);
                    router.refresh();
                  }}
                  className="h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  ✓ סמן כנקרא
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpened((cur) => {
                      const next = new Set(cur);
                      if (next.has(caseId)) next.delete(caseId);
                      else next.add(caseId);
                      return next;
                    });
                  }}
                  className="h-8 px-2.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  aria-expanded={expanded}
                >
                  {expanded ? 'הסתר ▴' : 'הצג ▾'}
                </button>
              )}
            </div>

            {/* Notifications in this group (folded when nothing is new) */}
            {expanded && (
              <div className="divide-y divide-gray-100">
                {group.items.map((n) => (
                  <NotificationItem key={n.id} n={n} onNavigate={handleClick} onMarkRead={handleMarkRead} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped notifications */}
      {ungrouped.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-lg">🔔</span>
            <span className="font-bold text-gray-600 text-sm">כללי</span>
            <span className="mr-auto text-xs text-gray-400">{ungrouped.length} התראות</span>
          </div>
          <div className="divide-y divide-gray-100">
            {ungrouped.map((n) => (
              <NotificationItem key={n.id} n={n} onNavigate={handleClick} onMarkRead={handleMarkRead} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
