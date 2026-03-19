/**
 * Mock data for PREVIEW mode (no Supabase). Allows viewing full CRM flow without DB/auth.
 */
import type {
  Branch,
  RolePermission,
  WorkflowStepTemplate,
  Profile,
  Car,
  Case,
  CaseWorkflowRun,
  CaseWorkflowStep,
  CeoApproval,
  BodyworkExtra,
  Notification,
  AuditEvent,
} from '@/types/database';

const now = new Date().toISOString();
const past = new Date(Date.now() - 86400000 * 3).toISOString();

export const PREVIEW_USER_ID = '00000000-0000-0000-0000-000000000001';          // ערן - SERVICE_MANAGER
export const PREVIEW_USER_ID_CEO = '00000000-0000-0000-0000-000000000002';      // עמית - CEO
export const PREVIEW_USER_ID_OFFICE = '00000000-0000-0000-0000-000000000003';  // אילנה - OFFICE

export const MOCK_BRANCHES: Branch[] = [
  { id: '10000000-0000-0000-0000-000000000001', name: 'נתיבות', created_at: now, updated_at: now },
  { id: '10000000-0000-0000-0000-000000000002', name: 'אשקלון', created_at: now, updated_at: now },
];

export const MOCK_PROFILES: Profile[] = [
  {
    id: PREVIEW_USER_ID,
    full_name: 'ערן',
    role: 'SERVICE_MANAGER',
    branch_id: MOCK_BRANCHES[0].id,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: PREVIEW_USER_ID_CEO,
    full_name: 'עמית',
    role: 'CEO',
    branch_id: null,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: PREVIEW_USER_ID_OFFICE,
    full_name: 'אילנה',
    role: 'OFFICE',
    branch_id: MOCK_BRANCHES[0].id,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
];

export const MOCK_CARS: Car[] = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    branch_id: MOCK_BRANCHES[0].id,
    license_plate: '1234567',
    make: 'טויוטה',
    model: 'קורולה',
    year: 2020,
    vin: null,
    first_registration_date: '2020-06-01',
    vehicle_type: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    branch_id: MOCK_BRANCHES[0].id,
    license_plate: '7654321',
    make: 'מאזדה',
    model: '3',
    year: 2021,
    vin: null,
    first_registration_date: '2021-01-15',
    vehicle_type: null,
    created_at: now,
    updated_at: now,
  },
];

export const MOCK_CASES: Case[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    branch_id: MOCK_BRANCHES[0].id,
    car_id: MOCK_CARS[0].id,
    case_key: '1234567-PRIVATE',
    claim_number: null,
    general_status: 'IN_PROGRESS',
    parts_status: 'AVAILABLE',
    insurance_type: 'PRIVATE',
    claim_type: 'PRIVATE',
    sub_claim_type: null,
    fixcar_link: 'https://fixcar.example/1',
    wheels_check_link: null,
    customer_name: null,
    phone: null,
    insurance_company: null,
    appraiser_name: null,
    event_date: null,
    opened_at: past,
    treatment_finished_at: null,
    closed_at: null,
    created_by: PREVIEW_USER_ID,
    created_at: past,
    updated_at: now,
    notes: null,
    painter_status: null,
    parts_ordered: null,
    parts_arrived: null,
    qc_assignee: null,
    estimate_link: null,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    branch_id: MOCK_BRANCHES[0].id,
    car_id: MOCK_CARS[1].id,
    case_key: '7654321-12345',
    claim_number: '12345',
    general_status: 'IN_PROGRESS',
    parts_status: 'AVAILABLE',
    insurance_type: 'COMPREHENSIVE',
    claim_type: 'ACCIDENT',
    sub_claim_type: null,
    fixcar_link: 'https://fixcar.example/2',
    wheels_check_link: null,
    customer_name: null,
    phone: null,
    insurance_company: null,
    appraiser_name: null,
    event_date: null,
    opened_at: past,
    treatment_finished_at: past,
    closed_at: null,
    created_by: PREVIEW_USER_ID,
    created_at: past,
    updated_at: now,
    notes: null,
    painter_status: null,
    parts_ordered: null,
    parts_arrived: null,
    qc_assignee: null,
    estimate_link: null,
  },
];

export const MOCK_RUNS: CaseWorkflowRun[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    case_id: MOCK_CASES[0].id,
    workflow_type: 'PROFESSIONAL',
    status: 'ACTIVE',
    created_at: past,
    updated_at: now,
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    case_id: MOCK_CASES[1].id,
    workflow_type: 'PROFESSIONAL',
    status: 'COMPLETED',
    created_at: past,
    updated_at: now,
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    case_id: MOCK_CASES[1].id,
    workflow_type: 'CLOSURE',
    status: 'ACTIVE',
    created_at: past,
    updated_at: now,
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    case_id: MOCK_CASES[0].id,
    workflow_type: 'CLOSURE',
    status: 'ACTIVE',
    created_at: past,
    updated_at: now,
  },
];

const PRO_STEPS = [
  'OPEN_CASE',
  'FIXCAR_PHOTOS',
  'WHEELS_CHECK',
  'PREP_ESTIMATE',
  'SUMMARIZE_ESTIMATE',
  'SEND_TO_APPRAISER',
  'WAIT_APPRAISER_APPROVAL',
  'ENTER_WORK',
  'QUALITY_CONTROL',
  'WASH',
  'READY_FOR_OFFICE',
] as const;
const CLOSURE_STEPS = ['CLOSURE_VERIFY_DETAILS_DOCS', 'CLOSURE_PROFORMA_IF_NEEDED', 'CLOSURE_PREPARE_CLOSING_FORMS', 'CLOSE_CASE'] as const;

export const MOCK_STEPS: CaseWorkflowStep[] = [
  ...PRO_STEPS.map((step_key, i) => ({
    id: `50000000-0000-0000-0000-${String(100 + i).padStart(12, '0')}`,
    run_id: MOCK_RUNS[0].id,
    step_key,
    state: (i === 0 ? 'DONE' : i === 1 ? 'ACTIVE' : 'PENDING') as 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED',
    order_index: i,
    activated_at: i === 1 ? past : null,
    completed_at: i === 0 ? past : null,
    completed_by: i === 0 ? PREVIEW_USER_ID : null,
    created_at: now,
    updated_at: now,
  })),
  ...CLOSURE_STEPS.map((step_key, i) => ({
    id: `50000000-0000-0000-0000-${String(200 + i).padStart(12, '0')}`,
    run_id: MOCK_RUNS[2].id,
    step_key,
    state: (i === 0 ? 'ACTIVE' : 'PENDING') as 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED',
    order_index: i,
    activated_at: i === 0 ? past : null,
    completed_at: null,
    completed_by: null,
    created_at: now,
    updated_at: now,
  })),
  ...CLOSURE_STEPS.map((step_key, i) => ({
    id: `50000000-0000-0000-0000-${String(300 + i).padStart(12, '0')}`,
    run_id: MOCK_RUNS[3].id,
    step_key,
    state: (i === 0 ? 'ACTIVE' : 'PENDING') as 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED',
    order_index: i,
    activated_at: i === 0 ? past : null,
    completed_at: null,
    completed_by: null,
    created_at: now,
    updated_at: now,
  })),
];

export const MOCK_APPROVALS: CeoApproval[] = [
  {
    id: '60000000-0000-0000-0000-000000000001',
    case_id: MOCK_CASES[0].id,
    approval_type: 'ESTIMATE_AND_DETAILS',
    status: 'PENDING',
    rejection_note: null,
    decided_at: null,
    decided_by: null,
    created_at: past,
    updated_at: now,
  },
];

export const MOCK_EXTRAS: BodyworkExtra[] = [
  {
    id: '70000000-0000-0000-0000-000000000001',
    case_id: MOCK_CASES[0].id,
    description: 'תיקון פגיעה בדלת',
    image_path: 'extras/preview1.jpg',
    status: 'IN_TREATMENT',
    created_by: PREVIEW_USER_ID,
    created_at: past,
    updated_at: now,
  },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '80000000-0000-0000-0000-000000000001',
    user_id: PREVIEW_USER_ID,
    type: 'BLOCKED_ACTION',
    title: 'פעולה חסומה',
    body: 'במצב תצוגה מקדימה — הפעולה לא נשמרת',
    read: false,
    created_at: now,
    case_id: null,
  },
];

export const MOCK_AUDIT: AuditEvent[] = [
  {
    id: '90000000-0000-0000-0000-000000000001',
    entity_type: 'CASE',
    entity_id: MOCK_CASES[0].id,
    action: 'CASE_CREATED',
    user_id: PREVIEW_USER_ID,
    payload: { case_key: MOCK_CASES[0].case_key },
    created_at: past,
  },
];

const MOCK_ROLE_PERMISSIONS: RolePermission[] = [
  { id: 'rp-1', role: 'CEO', action: 'create_case', enabled: true, created_at: now },
  { id: 'rp-2', role: 'CEO', action: 'complete_professional_step', enabled: true, created_at: now },
  { id: 'rp-3', role: 'CEO', action: 'complete_closure_step', enabled: true, created_at: now },
  { id: 'rp-4', role: 'CEO', action: 'manage_settings', enabled: true, created_at: now },
  { id: 'rp-5', role: 'SERVICE_MANAGER', action: 'create_case', enabled: true, created_at: now },
  { id: 'rp-6', role: 'SERVICE_MANAGER', action: 'complete_professional_step', enabled: true, created_at: now },
  { id: 'rp-7', role: 'OFFICE', action: 'create_case', enabled: true, created_at: now },
  { id: 'rp-8', role: 'OFFICE', action: 'complete_closure_step', enabled: true, created_at: now },
];

const MOCK_WORKFLOW_STEP_TEMPLATES: WorkflowStepTemplate[] = [
  { id: 'wst-1', step_key: 'OPEN_CASE', step_label: 'פתיחת תיק', order_index: 0, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-2', step_key: 'FIXCAR_PHOTOS', step_label: 'צילום FixCar', order_index: 1, is_enabled: true, requires_link: true, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-3', step_key: 'WHEELS_CHECK', step_label: 'טפסי גלגלים', order_index: 2, is_enabled: true, requires_link: false, requires_file_or_link: true, requires_ceo_approval: false, created_at: now },
  { id: 'wst-4', step_key: 'PREP_ESTIMATE', step_label: 'אומדן', order_index: 3, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-5', step_key: 'SEND_TO_APPRAISER', step_label: 'שליחה לשמאי', order_index: 4, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-6', step_key: 'WAIT_APPRAISER_APPROVAL', step_label: 'המתנה לאישור שמאי', order_index: 5, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: true, created_at: now },
  { id: 'wst-7', step_key: 'ENTER_WORK', step_label: 'כניסה לעבודה', order_index: 6, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-8', step_key: 'ISSUE_CATALOG_NUMBERS', step_label: 'ניפוק מק"טים', order_index: 7, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-9', step_key: 'PARTS_DISCOUNTS', step_label: 'הנחות חלקים', order_index: 8, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-10', step_key: 'QUALITY_CONTROL', step_label: 'בקרת איכות', order_index: 9, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-11', step_key: 'WASH', step_label: 'שטיפה', order_index: 10, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-12', step_key: 'SEND_COMPLETION_PHOTOS', step_label: 'שליחת תמונות לשמאי גמר תיקון', order_index: 11, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
  { id: 'wst-13', step_key: 'READY_FOR_OFFICE', step_label: 'מוכן למשרד', order_index: 12, is_enabled: true, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false, created_at: now },
];

export function getPreviewStore() {
  return {
    branches: [...MOCK_BRANCHES],
    profiles: [...MOCK_PROFILES],
    cars: [...MOCK_CARS],
    cases: [...MOCK_CASES],
    case_workflow_runs: [...MOCK_RUNS],
    case_workflow_steps: [...MOCK_STEPS],
    ceo_approvals: [...MOCK_APPROVALS],
    bodywork_extras: [...MOCK_EXTRAS],
    notifications: [...MOCK_NOTIFICATIONS],
    audit_events: [...MOCK_AUDIT],
    role_permissions: [...MOCK_ROLE_PERMISSIONS],
    workflow_step_templates: [...MOCK_WORKFLOW_STEP_TEMPLATES],
  };
}
