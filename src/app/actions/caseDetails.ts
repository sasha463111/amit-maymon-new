'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Only these case columns may be edited via the inline detail form. RLS scopes
// WHICH row (branch), but not WHICH columns — without this allow-list an
// in-branch user could write general_status, closed_at, deleted_at, branch_id,
// created_by, etc. by crafting the request. Keep in sync with the editable
// fields in CaseDetailClientV2.
const ALLOWED_CASE_COLS = new Set([
  'customer_name', 'phone', 'insurance_company', 'appraiser_name', 'event_date',
  'claim_number', 'sub_claim_type', 'insurance_type', 'claim_type',
  'fixcar_link', 'wheels_check_link', 'estimate_link', 'notes',
  'parts_status', 'parts_ordered', 'parts_arrived', 'painter_status',
  'appraiser_status', 'qc_assignee',
  'enter_work_checklist_state', 'catalog_numbers_assignee',
  'parts_discounts_assignee', 'completion_photos_assignee',
]);
const ALLOWED_CAR_COLS = new Set([
  'license_plate', 'make', 'model', 'year', 'vin', 'vehicle_type', 'first_registration_date',
]);

export async function updateCaseDetails(
  caseId: string,
  caseUpdates: Record<string, string | number | boolean | null>,
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

  // Strip any column not on the allow-list.
  const safeCaseUpdates: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(caseUpdates)) {
    if (ALLOWED_CASE_COLS.has(k)) safeCaseUpdates[k] = v;
  }
  const rejectedCase = Object.keys(caseUpdates).filter((k) => !ALLOWED_CASE_COLS.has(k));
  if (rejectedCase.length > 0) {
    console.warn('[updateCaseDetails] rejected non-editable case columns', rejectedCase);
  }

  if (Object.keys(safeCaseUpdates).length > 0) {
    const { error } = await supabase
      .from('cases')
      .update(safeCaseUpdates as never)
      .eq('id', caseId);
    if (error) return { error: error.message };
  }

  const safeCarUpdates: Record<string, string | number | null> = {};
  if (carUpdates) {
    for (const [k, v] of Object.entries(carUpdates)) {
      if (ALLOWED_CAR_COLS.has(k)) safeCarUpdates[k] = v;
    }
  }

  if (Object.keys(safeCarUpdates).length > 0) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('car_id')
      .eq('id', caseId)
      .single();
    if (caseData) {
      const { error } = await supabase
        .from('cars')
        .update(safeCarUpdates as never)
        .eq('id', (caseData as { car_id: string }).car_id);
      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}
