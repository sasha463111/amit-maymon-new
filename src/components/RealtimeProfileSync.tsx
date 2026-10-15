'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Real-time sync of profile changes across all connected clients.
 * When CEO changes user roles/branches/names in settings, all users see updates immediately.
 * No page refresh needed.
 */
export function RealtimeProfileSync({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();

    // Subscribe to profile changes
    const channel = supabase
      .channel('profiles-realtime', {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          // When a profile is updated, force a page refresh if it's the current user
          // or clear any cached UI state that depends on roles/branches
          if (payload.new.id === userId) {
            // Current user's profile changed — pick up new permissions. Only
            // when what the screen depends on changed, and with a soft refresh:
            // a full reload wiped whatever the person was typing (Amit, 15/10).
            const before = payload.old as Record<string, unknown> | undefined;
            const after = payload.new as Record<string, unknown>;
            const keys = ['role', 'branch_ids', 'is_active', 'office_function', 'sees_all_branches'];
            const changed = !before || keys.some((k) => k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
            if (changed) router.refresh();
          } else {
            // Another user's profile changed
            // Dispatch custom event for components listening to role changes
            const event = new CustomEvent('profile-updated', {
              detail: { userId: payload.new.id, changes: payload.new },
            });
            window.dispatchEvent(event);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time profile sync enabled');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('⚠️ Real-time sync disconnected');
        }
      });

    // Cleanup subscription on unmount
    return () => {
      channel.unsubscribe();
    };
  }, [userId, router]);

  return null; // This component doesn't render anything
}
