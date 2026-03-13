'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updateCaseDetails(
  caseId: string,
  caseUpdates: Record<string, string | number | null>,
  carUpdates?: Record<string, string | number | null>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileData as { role: string } | null)?.role;
  if (role === 'PAINTER') return { error: 'אין הרשאה לעדכן פרטי תיק' };

  if (Object.keys(caseUpdates).length > 0) {
    const { error } = await supabase
      .from('cases')
      .update(caseUpdates as never)
      .eq('id', caseId);
    if (error) return { error: error.message };
  }

  if (carUpdates && Object.keys(carUpdates).length > 0) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('car_id')
      .eq('id', caseId)
      .single();
    if (caseData) {
      const { error } = await supabase
        .from('cars')
        .update(carUpdates as never)
        .eq('id', (caseData as { car_id: string }).car_id);
      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}
