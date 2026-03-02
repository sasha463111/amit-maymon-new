'use server';

import { createClient } from '@/lib/supabase/server';
import type { RolePermission, WorkflowStepTemplate } from '@/types/database';

async function requireCeo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' as string, supabase: null, userId: null };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'CEO') return { error: 'רק מנכ"ל יכול לגשת להגדרות' as string, supabase: null, userId: null };

  return { error: null, supabase, userId: user.id };
}

export async function getRolePermissions(): Promise<{ data: RolePermission[] | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'לא מחובר' };

  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .order('role')
    .order('action');

  if (error) return { data: null, error: error.message };
  return { data: data as RolePermission[], error: null };
}

export async function updateRolePermission(
  role: string,
  action: string,
  enabled: boolean
): Promise<{ ok?: boolean; error?: string }> {
  const { error: authError, supabase } = await requireCeo();
  if (authError || !supabase) return { error: authError ?? 'שגיאת אימות' };

  // CEO permissions are always enabled and cannot be changed
  if (role === 'CEO') return { error: 'לא ניתן לשנות הרשאות מנכ"ל' };

  const { error } = await supabase
    .from('role_permissions')
    .upsert({ role, action, enabled }, { onConflict: 'role,action' } as never);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function getWorkflowStepTemplates(): Promise<{ data: WorkflowStepTemplate[] | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'לא מחובר' };

  const { data, error } = await supabase
    .from('workflow_step_templates')
    .select('*')
    .order('order_index');

  if (error) return { data: null, error: error.message };
  return { data: data as WorkflowStepTemplate[], error: null };
}

export async function updateWorkflowStep(
  id: string,
  updates: Partial<Pick<WorkflowStepTemplate, 'step_label' | 'order_index' | 'is_enabled' | 'requires_link' | 'requires_file_or_link'>>
): Promise<{ ok?: boolean; error?: string }> {
  const { error: authError, supabase } = await requireCeo();
  if (authError || !supabase) return { error: authError ?? 'שגיאת אימות' };

  const { error } = await supabase
    .from('workflow_step_templates')
    .update(updates as never)
    .eq('id', id);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function addWorkflowStep(step: {
  step_key: string;
  step_label: string;
  order_index: number;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const { error: authError, supabase } = await requireCeo();
  if (authError || !supabase) return { error: authError ?? 'שגיאת אימות' };

  if (!step.step_key?.trim()) return { error: 'מפתח שלב חובה' };
  if (!step.step_label?.trim()) return { error: 'שם שלב חובה' };

  const { data, error } = await supabase
    .from('workflow_step_templates')
    .insert({
      step_key: step.step_key.trim().toUpperCase().replace(/\s+/g, '_'),
      step_label: step.step_label.trim(),
      order_index: step.order_index,
      is_enabled: true,
      requires_link: false,
      requires_file_or_link: false,
    } as never)
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function removeWorkflowStep(id: string): Promise<{ ok?: boolean; error?: string }> {
  const { error: authError, supabase } = await requireCeo();
  if (authError || !supabase) return { error: authError ?? 'שגיאת אימות' };

  // Prevent removing core steps
  const { data: step } = await supabase
    .from('workflow_step_templates')
    .select('step_key')
    .eq('id', id)
    .single();

  const protectedKeys = ['OPEN_CASE', 'READY_FOR_OFFICE', 'CLOSE_CASE'];
  if (step && protectedKeys.includes((step as { step_key: string }).step_key)) {
    return { error: 'לא ניתן להסיר שלב מוגן' };
  }

  const { error } = await supabase
    .from('workflow_step_templates')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return { ok: true };
}
