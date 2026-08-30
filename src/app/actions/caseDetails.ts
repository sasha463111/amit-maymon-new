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
  'claim_number', 'sub_claim_type', 'sub_claim_type_other_text', 'insurance_type', 'claim_type',
  'fixcar_link', 'wheels_check_link', 'estimate_link', 'notes',
  'parts_status', 'parts_ordered', 'parts_arrived', 'painter_status',
  'painter_status_other_text',
  'appraiser_status', 'qc_assignee',
  'enter_work_checklist_state', 'catalog_numbers_assignee',
  'parts_discounts_assignee', 'completion_photos_assignee',
  'closure_checklist_state',
]);
const ALLOWED_CAR_COLS = new Set([
  'license_plate', 'make', 'model', 'year', 'vin', 'vehicle_type', 'first_registration_date',
]);
// PAINTER is otherwise blocked from this action entirely (see below) — these
// three are the exception, the fields their own screens let them set on
// themselves (painter status + the enter-work checklist), never anything
// about the case's actual details.
const PAINTER_ALLOWED_COLS = new Set(['painter_status', 'painter_status_other_text', 'enter_work_checklist_state']);

export async function updateCaseDetails(
  caseId: string,
  caseUpdates: Record<string, string | number | boolean | string[] | Record<string, boolean> | null>,
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
  const isPainter = role === 'PAINTER';
  // A painter may only touch their own status/checklist columns — never the
  // rest of the case's details. Non-painter roles use the full allow-list.
  const effectiveAllowedCols = isPainter ? PAINTER_ALLOWED_COLS : ALLOWED_CASE_COLS;
  if (isPainter && carUpdates && Object.keys(carUpdates).length > 0) {
    return { error: 'אין הרשאה לעדכן פרטי רכב' };
  }

  // Strip any column not on the (role-appropriate) allow-list.
  const safeCaseUpdates: Record<string, string | number | boolean | string[] | Record<string, boolean> | null> = {};
  for (const [k, v] of Object.entries(caseUpdates)) {
    if (effectiveAllowedCols.has(k)) safeCaseUpdates[k] = v;
  }
  const rejectedCase = Object.keys(caseUpdates).filter((k) => !effectiveAllowedCols.has(k));
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
