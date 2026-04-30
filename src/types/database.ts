/**
 * Database types for Tehila Bodyshop CRM
 * Mirrors Postgres enums and table definitions.
 */

export type UserRole =
  | 'SERVICE_MANAGER'
  | 'OFFICE'
  | 'CEO'
  | 'PAINTER'
  | 'SERVICE_ADVISOR';

export type GeneralStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED';

export type PartsStatus = 'NO_PARTS' | 'ORDERED' | 'AVAILABLE' | 'AIRMAIL_PENDING';

export type InsuranceType =
  | 'COMPREHENSIVE'
  | 'THIRD_PARTY'
  | 'PRIVATE'
  | 'OTHER';

export type ClaimType = 'PRIVATE' | 'ACCIDENT' | 'FLOOD';

export type SubClaimType =
  | 'POLICY'
  | 'THIRD_PARTY'
  | 'THIRD_PARTY_SETTLEMENT'
  | 'PRIVATE_REPAIR'
  | 'SHLOMO_POLICY'
  | 'SHLOMO_THIRD_PARTY';

export type WorkflowType = 'PROFESSIONAL' | 'CLOSURE';

export type WorkflowRunStatus = 'ACTIVE' | 'COMPLETED';

export type StepState = 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED';

export type ApprovalType = 'ESTIMATE_AND_DETAILS' | 'WHEELS_CHECK' | 'CASE_CLOSURE';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ExtraStatus = 'IN_TREATMENT' | 'REJECTED' | 'DONE';

export type PainterStatus = 'IN_WORK' | 'WAITING_PARTS' | 'PARTS_ARRIVED' | 'READY_FOR_RELEASE';

export const PAINTER_STATUS_LABELS: Record<PainterStatus, string> = {
  IN_WORK: 'בעבודה',
  WAITING_PARTS: 'ממתין לחלקים',
  PARTS_ARRIVED: 'הגיעו חלקים',
  READY_FOR_RELEASE: 'מוכן לשחרור',
};

export type AuditEntityType =
  | 'CASE'
  | 'WORKFLOW_STEP'
  | 'APPROVAL'
  | 'EXTRA';

export interface Branch {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Car {
  id: string;
  branch_id: string;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  first_registration_date: string | null; // DATE as ISO string
  vehicle_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface Case {
  id: string;
  branch_id: string;
  car_id: string;
  case_key: string | null;
  claim_number: string | null;
  general_status: GeneralStatus;
  parts_status: PartsStatus;
  insurance_type: InsuranceType | null;
  claim_type: ClaimType | null;
  sub_claim_type: SubClaimType | null;
  fixcar_link: string | null;
  wheels_check_link: string | null;
  customer_name: string | null;
  phone: string | null;
  insurance_company: string | null;
  appraiser_name: string | null;
  event_date: string | null;
  opened_at: string | null;
  treatment_finished_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Added in migration 013
  notes: string | null;
  painter_status: PainterStatus | null;
  parts_ordered: boolean | null;
  parts_arrived: boolean | null;
  qc_assignee: string | null;
  estimate_link: string | null;
  // Added in migration 020 (Session 6)
  enter_work_checklist_state: string[] | null;
  catalog_numbers_assignee: string | null;
  parts_discounts_assignee: string | null;
  completion_photos_assignee: string | null;
}

export interface CaseWorkflowRun {
  id: string;
  case_id: string;
  workflow_type: WorkflowType;
  status: WorkflowRunStatus;
  created_at: string;
  updated_at: string;
}

export interface CaseWorkflowStep {
  id: string;
  run_id: string;
  step_key: string;
  state: StepState;
  order_index: number;
  activated_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CeoApproval {
  id: string;
  case_id: string;
  approval_type: ApprovalType;
  status: ApprovalStatus;
  rejection_note: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyworkExtra {
  id: string;
  case_id: string;
  description: string;
  image_path: string;
  status: ExtraStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationType =
  | 'BLOCKED_ACTION'
  | 'CEO_REJECTED'
  | 'EXTRA_CREATED'
  | 'EXTRA_STATUS_CHANGED'
  | 'APPROVAL_NEEDED'
  | 'PENDING_APPROVAL'
  | 'PAINTER_READY_FOR_RELEASE'
  | 'PAINTER_REQUEST'
  | 'READY_FOR_OFFICE'
  | 'WASH_STARTED'
  | 'FINAL_ESTIMATE_UPLOADED'
  | 'OTHER';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType | null;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  // Added in migration 013
  case_id: string | null;
  // Added in migration 020 (Session 6)
  triggered_by: string | null;
  action_url: string | null;
}

export interface SystemMessage {
  id: string;
  message: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: string;
  user_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role: string;
  action: string;
  enabled: boolean;
  created_at: string;
}

export interface WorkflowStepTemplate {
  id: string;
  step_key: string;
  step_label: string;
  order_index: number;
  is_enabled: boolean;
  requires_link: boolean;
  requires_file_or_link: boolean;
  requires_ceo_approval: boolean;
  created_at: string;
}

// Step keys for professional workflow (order) — used as fallback
export const PROFESSIONAL_WORKFLOW_STEPS = [
  'OPEN_CASE',
  'FIXCAR_PHOTOS',
  'WHEELS_CHECK',
  'PREP_ESTIMATE',
  'SEND_TO_APPRAISER',
  'WAIT_APPRAISER_APPROVAL',
  'ENTER_WORK',
  'ISSUE_CATALOG_NUMBERS',
  'PARTS_DISCOUNTS',
  'QUALITY_CONTROL',
  'WASH',
  'SEND_COMPLETION_PHOTOS',
  'READY_FOR_OFFICE',
] as const;

export type ProfessionalStepKey = (typeof PROFESSIONAL_WORKFLOW_STEPS)[number];

// Step keys for closure workflow
export const CLOSURE_WORKFLOW_STEPS = [
  'CLOSURE_VERIFY_DETAILS_DOCS',
  'CLOSURE_PROFORMA_IF_NEEDED',
  'CLOSURE_PREPARE_CLOSING_FORMS',
  'CLOSE_CASE',
] as const;

export type ClosureStepKey = (typeof CLOSURE_WORKFLOW_STEPS)[number];

export type WorkflowStepKey = ProfessionalStepKey | ClosureStepKey;

// Audit event action types (for action field)
export type AuditActionType =
  | 'CASE_CREATED'
  | 'CASE_CLOSED'
  | 'STEP_ACTIVATED'
  | 'STEP_COMPLETED'
  | 'STEP_SKIPPED'
  | 'EXTRA_CREATED'
  | 'EXTRA_STATUS_CHANGED'
  | 'APPROVAL_APPROVED'
  | 'APPROVAL_REJECTED'
  | 'BLOCKED_ACTION'
  | 'RETURNED_TO_ESTIMATE';

// Labels for parts status
export const PARTS_STATUS_LABELS: Record<PartsStatus, string> = {
  NO_PARTS: 'אין חלקים',
  ORDERED: 'הוזמנו',
  AVAILABLE: 'זמינים',
  AIRMAIL_PENDING: 'ממתין לדואר אוויר',
};

// Labels for sub_claim_type
export const SUB_CLAIM_TYPE_LABELS: Record<SubClaimType, string> = {
  POLICY: 'פוליסה',
  THIRD_PARTY: 'צד ג\'',
  THIRD_PARTY_SETTLEMENT: 'הסדר ג\'',
  PRIVATE_REPAIR: 'תיקון פרטי',
  SHLOMO_POLICY: 'מוקד שלמה פוליסה',
  SHLOMO_THIRD_PARTY: 'מוקד שלמה צד ג\'',
};

// DTOs for actions
export interface CreateCaseInput {
  plate_number: string;
  claim_number?: string | null;
  first_registration_date?: string | null; // ISO date — optional (תאריך עלייה לכביש הוסר מהטופס)
  insurance_type?: InsuranceType | null;
  claim_type?: ClaimType | null;
  sub_claim_type?: SubClaimType | null;
  branch_id: string;
  // New fields
  customer_name?: string | null;
  phone?: string | null;
  insurance_company?: string | null;
  appraiser_name?: string | null;
  event_date?: string | null;
  vehicle_type?: string | null;
  vehicle_year?: number | null;
}

export interface CompleteStepInput {
  case_id: string;
  step_id?: string; // optional: complete current active step
}

export interface CreateExtraInput {
  case_id: string;
  description: string;
  image_path: string; // Storage path after upload
}

export interface ApprovalDecisionInput {
  approval_id: string;
  status: 'APPROVED' | 'REJECTED';
  rejection_note?: string | null;
}

export interface UpdateExtraStatusInput {
  extra_id: string;
  status: ExtraStatus;
}

// Supabase generated types (for use with supabase.from<>())
export type Database = {
  public: {
    Tables: {
      branches: { Row: Branch; Insert: Omit<Branch, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<Branch> };
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }; Update: Partial<Profile> };
      cars: { Row: Car; Insert: Omit<Car, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<Car> };
      cases: { Row: Case; Insert: Omit<Case, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<Case> };
      case_workflow_runs: { Row: CaseWorkflowRun; Insert: Omit<CaseWorkflowRun, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<CaseWorkflowRun> };
      case_workflow_steps: { Row: CaseWorkflowStep; Insert: Omit<CaseWorkflowStep, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<CaseWorkflowStep> };
      ceo_approvals: { Row: CeoApproval; Insert: Omit<CeoApproval, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<CeoApproval> };
      bodywork_extras: { Row: BodyworkExtra; Insert: Omit<BodyworkExtra, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<BodyworkExtra> };
      notifications: { Row: Notification; Insert: Omit<Notification, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<Notification> };
      audit_events: { Row: AuditEvent; Insert: Omit<AuditEvent, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<AuditEvent> };
      role_permissions: { Row: RolePermission; Insert: Omit<RolePermission, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<RolePermission> };
      workflow_step_templates: { Row: WorkflowStepTemplate; Insert: Omit<WorkflowStepTemplate, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<WorkflowStepTemplate> };
    };
    Enums: {
      user_role: UserRole;
      general_status: GeneralStatus;
      parts_status: PartsStatus;
      insurance_type: InsuranceType;
      claim_type: ClaimType;
      sub_claim_type: SubClaimType;
      workflow_type: WorkflowType;
      workflow_run_status: WorkflowRunStatus;
      step_state: StepState;
      approval_type: ApprovalType;
      approval_status: ApprovalStatus;
      extra_status: ExtraStatus;
      audit_entity_type: AuditEntityType;
    };
  };
};
