'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Log user activity (page visits, actions)
 * Called from middleware or components to track user behavior
 */
export async function logActivity(params: {
  action: string;
  page_url?: string;
  metadata?: Record<string, any>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('activity_log').insert({
    user_id: user.id,
    action: params.action,
    page_url: params.page_url || typeof window !== 'undefined' ? window.location.pathname : null,
    metadata: params.metadata || null,
  } as any).catch(() => {
    // Silently fail - don't break the app if logging fails
  });
}

/**
 * Get audit logs for CEO dashboard
 */
export async function getAuditLogs(limit = 100) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  // Check if CEO
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((profile as any)?.role !== 'CEO') {
    return { data: [], error: 'Only CEO can view audit logs' };
  }

  const { data, error } = await supabase
    .from('audit_log')
    .select(`
      id,
      user_id,
      action,
      table_name,
      old_values,
      new_values,
      created_at,
      changed_by
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data: data || [], error: error?.message || null };
}

/**
 * Get activity logs for CEO dashboard
 */
export async function getActivityLogs(limit = 100, userId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  // Check if CEO
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((profile as any)?.role !== 'CEO') {
    return { data: [], error: 'Only CEO can view activity logs' };
  }

  let query = supabase
    .from('activity_log')
    .select(`
      id,
      user_id,
      action,
      page_url,
      metadata,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.limit(limit);

  return { data: data || [], error: error?.message || null };
}

/**
 * Get user creation timeline
 */
export async function getUserCreationTimeline() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  // Check if CEO
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((profile as any)?.role !== 'CEO') {
    return { data: [], error: 'Only CEO can view' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_ids, created_at')
    .order('created_at', { ascending: false });

  return { data: data || [], error: error?.message || null };
}
