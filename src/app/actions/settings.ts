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
    .update({ enabled } as never)
    .eq('role', role)
    .eq('action', action);

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
  updates: Partial<Pick<WorkflowStepTemplate, 'step_label' | 'order_index' | 'is_enabled' | 'requires_link' | 'requires_file_or_link' | 'requires_ceo_approval'>>
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

// =====================================================
// Bodywork Advisors
// =====================================================

export type BodyworkAdvisor = {
  id: string;
  full_name: string;
  role: string;
  branch_id: string | null;
  is_bodywork_advisor: boolean;
};

export async function getBodyworkAdvisors(): Promise<{ data: BodyworkAdvisor[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'לא מחובר' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_id, is_bodywork_advisor')
    .in('role', ['SERVICE_MANAGER', 'SERVICE_ADVISOR'])
    .eq('is_active', true)
    .order('full_name');

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as BodyworkAdvisor[], error: null };
}

export async function toggleBodyworkAdvisor(
  profileId: string,
  isAdvisor: boolean
): Promise<{ ok?: boolean; error?: string }> {
  const { error: authError, supabase } = await requireCeo();
  if (authError || !supabase) return { error: authError ?? 'שגיאת אימות' };

  const { error } = await supabase
    .from('profiles')
    .update({ is_bodywork_advisor: isAdvisor } as never)
    .eq('id', profileId);

  if (error) return { error: error.message };
  return { ok: true };
}
