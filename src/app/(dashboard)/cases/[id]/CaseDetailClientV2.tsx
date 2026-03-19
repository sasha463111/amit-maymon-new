'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { completeActiveStep, returnToEstimate, deleteCase } from '@/app/actions/workflow';
import { updateCaseDetails } from '@/app/actions/caseDetails';
import { uploadCaseDocument, deleteCaseDocument } from '@/app/actions/documents';
import { createClient } from '@/lib/supabase/client';
import type { PartsStatus, PainterStatus } from '@/types/database';
import { PARTS_STATUS_LABELS, PAINTER_STATUS_LABELS } from '@/types/database';

const DEFAULT_STEP_LABELS: Record<string, string> = {
  OPEN_CASE: 'פתיחת תיק',
  FIXCAR_PHOTOS: 'צילום FixCar',
  WHEELS_CHECK: 'טפסי גלגלים',
  PREP_ESTIMATE: 'אומדן',
  SUMMARIZE_ESTIMATE: 'סיכום אומדן',
  SEND_TO_APPRAISER: 'שליחה לשמאי',
  WAIT_APPRAISER_APPROVAL: 'המתנה לאישור שמאי',
  ENTER_WORK: 'כניסה לעבודה',
  ISSUE_CATALOG_NUMBERS: 'ניפוק מק"טים',
  PARTS_DISCOUNTS: 'הנחות חלקים ועבודות',
  QUALITY_CONTROL: 'בקרת איכות',
  WASH: 'שטיפה',
  SEND_COMPLETION_PHOTOS: 'שליחת תמונות לשמאי גמר תיקון',
  READY_FOR_OFFICE: 'מוכן למשרד',
};

type StepRow = {
  id: string;
  step_key: string;
  state: string;
  order_index: number;
  completed_at?: string | null;
  completed_by?: string | null;
};

type StepTemplate = {
  step_key: string;
  step_label: string;
  requires_link: boolean;
  requires_file_or_link: boolean;
  requires_ceo_approval?: boolean;
};

interface CaseDetailClientProps {
  caseId: string;
  caseKey: string | null;
  claimNumber: string | null;
  plate: string;
  branchName: string;
  openedAt: string | null;
  age: string;
  partsStatus: PartsStatus;
  generalStatus: string;
  fixcarLink: string | null;
  wheelsCheckLink: string | null;
  customerName: string | null;
  phone: string | null;
  insuranceCompany: string | null;
  appraiserName: string | null;
  eventDate: string | null;
  subClaimType: string | null;
  insuranceType: string | null;
  claimType: string | null;
  vehicleType: string | null;
  vehicleYear: number | null;
  carMake: string | null;
  carModel: string | null;
  carVin: string | null;
  steps: StepRow[];
  approvals: { id: string; approval_type: string; status: string; rejection_note: string | null }[];
  extras: { id: string; description: string; status: string }[];
  auditEvents: { id: string; action: string; user_id: string | null; created_at: string; payload: unknown }[];
  documents: { id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; created_at: string }[];
  role: string | null;
  userNames: Record<string, string>;
  stepTemplates: StepTemplate[];
  notes: string | null;
  partsOrdered: boolean | null;
  partsArrived: boolean | null;
  qcAssignee: string | null;
  estimateLink: string | null;
  painterStatus: string | null;
}

const SUB_CLAIM_LABELS: Record<string, string> = {
  POLICY: 'פוליסה',
  THIRD_PARTY: 'צד ג\'',
  THIRD_PARTY_SETTLEMENT: 'הסדר ג\'',
  PRIVATE_REPAIR: 'תיקון פרטי',
  SHLOMO_POLICY: 'מוקד שלמה פוליסה',
  SHLOMO_THIRD_PARTY: 'מוקד שלמה צד ג\'',
};

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  COMPREHENSIVE: 'מקיף',
  THIRD_PARTY: 'צד ג׳',
  PRIVATE: 'פרטי',
  OTHER: 'אחר',
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  PRIVATE: 'פרטי',
  ACCIDENT: 'תאונה',
  FLOOD: 'הצפה',
};

const CASE_FIELD_MAP: Record<string, string> = {
  customerName: 'customer_name',
  phone: 'phone',
  insuranceCompany: 'insurance_company',
  appraiserName: 'appraiser_name',
  eventDate: 'event_date',
  insuranceType: 'insurance_type',
  claimType: 'claim_type',
  subClaimType: 'sub_claim_type',
  claimNumber: 'claim_number',
};

const CAR_FIELD_MAP: Record<string, string> = {
  plate: 'license_plate',
  carMake: 'make',
  carModel: 'model',
  carVin: 'vin',
  vehicleType: 'vehicle_type',
  vehicleYear: 'year',
};

export function CaseDetailClientV2(props: CaseDetailClientProps) {
  const {
    caseId,
    claimNumber,
    plate,
    branchName,
    openedAt,
    age,
    partsStatus,
    fixcarLink,
    wheelsCheckLink,
    customerName,
    phone,
    insuranceCompany,
    appraiserName,
    eventDate,
    subClaimType,
    insuranceType,
    claimType,
    vehicleType,
    vehicleYear,
    carMake,
    carModel,
    carVin,
    steps,
    approvals,
    extras,
    auditEvents,
    documents,
    role,
    userNames,
    stepTemplates,
    notes: initialNotes,
    partsOrdered: initialPartsOrdered,
    partsArrived: initialPartsArrived,
    qcAssignee: initialQcAssignee,
    estimateLink: initialEstimateLink,
    painterStatus: initialPainterStatus,
  } = props;

  const router = useRouter();

  // Compute step labels from templates (fall back to defaults)
  const STEP_LABELS = useMemo(() => {
    const map: Record<string, string> = { ...DEFAULT_STEP_LABELS };
    for (const t of stepTemplates) {
      map[t.step_key] = t.step_label;
    }
    return map;
  }, [stepTemplates]);

  const STEPS_REQUIRING_LINK = useMemo(
    () => new Set(stepTemplates.filter((t) => t.requires_link).map((t) => t.step_key)),
    [stepTemplates]
  );

  const STEPS_REQUIRING_FILE_OR_LINK = useMemo(
    () => new Set(stepTemplates.filter((t) => t.requires_file_or_link).map((t) => t.step_key)),
    [stepTemplates]
  );

  const canEdit = role === 'SERVICE_MANAGER' || role === 'CEO';
  const canEditDetails = role !== 'PAINTER' && role !== null;

  // Inline-edit state for "פרטי תיק" fields
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    plate: plate !== '—' ? plate : '',
    claimNumber: claimNumber ?? '',
    customerName: customerName ?? '',
    phone: phone ?? '',
    insuranceCompany: insuranceCompany ?? '',
    appraiserName: appraiserName ?? '',
    eventDate: eventDate ?? '',
    insuranceType: insuranceType ?? '',
    claimType: claimType ?? '',
    subClaimType: subClaimType ?? '',
    carMake: carMake ?? '',
    carModel: carModel ?? '',
    carVin: carVin ?? '',
    vehicleType: vehicleType ?? '',
    vehicleYear: vehicleYear?.toString() ?? '',
  });
  const [fieldSaveError, setFieldSaveError] = useState<string | null>(null);

  // Dynamic age: recompute whenever vehicleYear changes in the inline editor
  const displayAge = useMemo(() => {
    const yr = fieldValues.vehicleYear ? parseInt(fieldValues.vehicleYear, 10) : null;
    if (!yr || isNaN(yr)) return age;
    const computed = new Date().getFullYear() - yr;
    return computed < 1 ? '<1' : String(computed);
  }, [fieldValues.vehicleYear, age]);

  function startEdit(field: string, value: string) {
    setEditingField(field);
    setEditValue(value);
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue('');
  }

  async function saveField() {
    if (!editingField) return;
    const field = editingField;
    const value = editValue;
    setEditingField(null);
    setEditValue('');

    if (value === fieldValues[field]) return;

    const oldValues = { ...fieldValues };
    setFieldValues((prev) => ({ ...prev, [field]: value }));

    const caseKey = CASE_FIELD_MAP[field];
    const carKey = CAR_FIELD_MAP[field];
    const caseUpdates: Record<string, string | number | null> = {};
    const carUpdates: Record<string, string | number | null> = {};

    if (caseKey) {
      caseUpdates[caseKey] = value || null;
    } else if (carKey) {
      carUpdates[carKey] = field === 'vehicleYear' ? (value ? parseInt(value, 10) : null) : (value || null);
    }

    const res = await updateCaseDetails(
      caseId,
      caseUpdates,
      Object.keys(carUpdates).length > 0 ? carUpdates : undefined
    );
    if (res?.error) {
      setFieldValues(oldValues);
      setFieldSaveError(res.error);
      setTimeout(() => setFieldSaveError(null), 5000);
    }
  }

  // New fields state (migration 013)
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [partsOrdered, setPartsOrdered] = useState<boolean | null>(initialPartsOrdered ?? null);
  const [partsArrived, setPartsArrived] = useState<boolean | null>(initialPartsArrived ?? null);
  const [qcAssignee, setQcAssignee] = useState(initialQcAssignee ?? '');
  // estimateLink kept in DB but not shown in UI (documents section handles file uploads)
  const [painterStatus, setPainterStatus] = useState<PainterStatus | ''>(
    (initialPainterStatus as PainterStatus | null) ?? ''
  );

  async function saveNotes() {
    if (!notesDirty) return;
    setNotesSaving(true);
    setNotesDirty(false);
    await updateCaseDetails(caseId, { notes: notes || null });
    setNotesSaving(false);
  }

  async function togglePartsOrdered() {
    const next = !partsOrdered;
    setPartsOrdered(next);
    await updateCaseDetails(caseId, { parts_ordered: next });
  }

  async function togglePartsArrived() {
    const next = !partsArrived;
    setPartsArrived(next);
    await updateCaseDetails(caseId, { parts_arrived: next });
  }

  async function saveQcAssignee(val: string) {
    setQcAssignee(val);
    await updateCaseDetails(caseId, { qc_assignee: val || null });
  }

  async function savePainterStatus(val: PainterStatus | '') {
    setPainterStatus(val);
    const supabase = (await import('@/lib/supabase/client')).createClient();
    await supabase.from('cases').update({ painter_status: val || null } as never).eq('id', caseId);
  }

  const [partsValue, setPartsValue] = useState<PartsStatus>(partsStatus);
  const [fixcarValue, setFixcarValue] = useState(fixcarLink ?? '');
  const [updatingParts, setUpdatingParts] = useState(false);
  const [partsStatusMessage, setPartsStatusMessage] = useState<string | null>(null);

  const [localSteps, setLocalSteps] = useState<StepRow[]>(steps);
  const effectiveSteps = localSteps;

  type ApprovalRow = { id: string; approval_type: string; status: string; rejection_note: string | null };
  const [localApprovals] = useState<ApprovalRow[]>(approvals);
  const effectiveApprovals = localApprovals;

  const [completingStepId, setCompletingStepId] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // FIXCAR link popup state
  const [editingLinkStepId, setEditingLinkStepId] = useState<string | null>(null);
  const [stepLinks, setStepLinks] = useState<Record<string, string>>({});

  // WHEELS CHECK file/link panel state
  const [wheelsCheckPanelStepId, setWheelsCheckPanelStepId] = useState<string | null>(null);
  const [wheelsMode, setWheelsMode] = useState<'link' | 'file'>('link');
  const [wheelsLinkValue, setWheelsLinkValue] = useState(wheelsCheckLink ?? '');
  const [wheelsFile, setWheelsFile] = useState<File | null>(null);
  const [wheelsUploading, setWheelsUploading] = useState(false);

  const [returning, setReturning] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [localDocuments, setLocalDocuments] = useState(documents);

  const initRef = useRef<string | null>(null);

  // Seed fixcar link
  useEffect(() => {
    if (!fixcarLink) return;
    const step = effectiveSteps.find((s) => s.step_key === 'FIXCAR_PHOTOS');
    if (!step) return;
    setStepLinks((prev) => ({ ...prev, [step.id]: fixcarLink }));
  }, [fixcarLink, effectiveSteps]);

  // Load steps from client DB
  useEffect(() => {
    if (!caseId || initRef.current === caseId) return;
    initRef.current = caseId;

    const loadSteps = async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data: runs } = await supabase
        .from('case_workflow_runs')
        .select('id')
        .eq('case_id', caseId)
        .eq('workflow_type', 'PROFESSIONAL');

      const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
      if (runIds.length === 0) { setLocalSteps(steps); return; }

      const { data: stepsData } = await supabase
        .from('case_workflow_steps')
        .select('id, step_key, state, order_index, completed_at, completed_by')
        .in('run_id', runIds)
        .order('order_index');

      if (stepsData && stepsData.length > 0) {
        setLocalSteps(stepsData as StepRow[]);
      } else if (steps.length > 0) {
        setLocalSteps(steps);
      }
    };

    loadSteps().catch(console.error);
  }, [caseId, steps]);

  const orderedSteps = useMemo(
    () => [...effectiveSteps].sort((a, b) => a.order_index - b.order_index),
    [effectiveSteps]
  );

  // Build timeline from audit events
  const timeline = useMemo(() => {
    const items: Array<{
      id: string;
      action: string;
      stepKey?: string;
      stepLabel: string;
      timestamp: string;
      type: 'step' | 'case';
      performedBy: string | null;
      userId: string | null;
    }> = [];

    auditEvents
      .filter((e) => e.action === 'STEP_COMPLETED')
      .forEach((e) => {
        const payload = e.payload as { step_key?: string } | null;
        const stepKey = payload?.step_key;
        const stepLabel = stepKey ? (STEP_LABELS[stepKey] ?? stepKey) : 'שלב לא ידוע';
        items.push({
          id: e.id,
          action: 'STEP_COMPLETED',
          stepKey,
          stepLabel: `הושלם: ${stepLabel}`,
          timestamp: e.created_at,
          type: 'step',
          performedBy: e.user_id ? (userNames[e.user_id] ?? null) : null,
          userId: e.user_id,
        });
      });

    effectiveSteps
      .filter((s) => s.state === 'DONE' && s.completed_at)
      .forEach((s) => {
        const stepLabel = STEP_LABELS[s.step_key] ?? s.step_key;
        if (!items.some((item) => item.stepKey === s.step_key && item.action === 'STEP_COMPLETED')) {
          items.push({
            id: `step-${s.id}`,
            action: 'STEP_COMPLETED',
            stepKey: s.step_key,
            stepLabel: `הושלם: ${stepLabel}`,
            timestamp: s.completed_at!,
            type: 'step',
            performedBy: s.completed_by ? (userNames[s.completed_by] ?? null) : null,
            userId: s.completed_by ?? null,
          });
        }
      });

    if (openedAt) {
      items.push({
        id: 'case-opened',
        action: 'CASE_CREATED',
        stepLabel: 'תיק נפתח',
        timestamp: openedAt,
        type: 'case',
        performedBy: null,
        userId: null,
      });
    }

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditEvents, effectiveSteps, openedAt, STEP_LABELS, userNames]);

  async function savePartsStatus(v: PartsStatus) {
    if (!canEdit) return;
    const oldValue = partsValue;
    setPartsValue(v);
    setUpdatingParts(true);
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      await supabase.from('cases').update({ parts_status: v } as never).eq('id', caseId);
      if (oldValue !== v) {
        setPartsStatusMessage(`סטטוס חלקים עודכן: ${PARTS_STATUS_LABELS[v]}`);
        setTimeout(() => setPartsStatusMessage(null), 5000);
      }
    } finally {
      setUpdatingParts(false);
    }
  }

  async function reloadStepsFromDB() {
    const supabase = (await import('@/lib/supabase/client')).createClient();
    const { data: runs } = await supabase
      .from('case_workflow_runs')
      .select('id')
      .eq('case_id', caseId)
      .eq('workflow_type', 'PROFESSIONAL');
    const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
    if (!runIds.length) return;
    const { data } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, state, order_index, completed_at, completed_by')
      .in('run_id', runIds)
      .order('order_index');
    if (data) setLocalSteps(data as StepRow[]);
  }

  async function performComplete(step: StepRow, link?: string) {
    // Optimistic update: mark step as DONE immediately before server call
    const now = new Date().toISOString();
    setLocalSteps((prev) =>
      prev.map((s) =>
        s.id === step.id ? { ...s, state: 'DONE' as const, completed_at: now, completed_by: null } : s
      )
    );
    setCompletingStepId(step.id);
    setStepError(null);
    try {
      const res = await completeActiveStep(caseId, step.id);
      if (res?.error) {
        // Revert optimistic update on error
        setLocalSteps((prev) =>
          prev.map((s) =>
            s.id === step.id ? { ...s, state: 'ACTIVE' as const, completed_at: null } : s
          )
        );
        setStepError(res.error);
      } else {
        // If FIXCAR link provided, save it
        if (step.step_key === 'FIXCAR_PHOTOS' && link) {
          const supabase = (await import('@/lib/supabase/client')).createClient();
          await supabase.from('cases').update({ fixcar_link: link } as never).eq('id', caseId);
          setFixcarValue(link);
        }
        // Reload from DB to get accurate server state (next step activated, etc.)
        await reloadStepsFromDB();
      }
    } catch (e) {
      console.error('[CaseDetailClientV2] complete failed:', e);
      // Revert optimistic update on exception
      setLocalSteps((prev) =>
        prev.map((s) =>
          s.id === step.id ? { ...s, state: 'ACTIVE' as const, completed_at: null } : s
        )
      );
      setStepError('שגיאה בהשלמת השלב');
    } finally {
      setCompletingStepId(null);
    }
  }

  async function handleComplete(step: StepRow) {
    if (!canEdit) return;
    setStepError(null);

    if (STEPS_REQUIRING_LINK.has(step.step_key)) {
      if (!stepLinks[step.id] && step.step_key === 'FIXCAR_PHOTOS' && fixcarValue) {
        setStepLinks((prev) => ({ ...prev, [step.id]: fixcarValue }));
      }
      setEditingLinkStepId(step.id);
      return;
    }

    if (STEPS_REQUIRING_FILE_OR_LINK.has(step.step_key)) {
      setWheelsCheckPanelStepId(step.id);
      return;
    }

    if (step.step_key === 'READY_FOR_OFFICE') {
      if (extras.some((e) => e.status === 'IN_TREATMENT')) {
        setStepError('לא ניתן להשלים - יש תוספות פחחות בטיפול');
        return;
      }
      const required = effectiveApprovals.filter(
        (a) => a.approval_type === 'ESTIMATE_AND_DETAILS' || a.approval_type === 'WHEELS_CHECK'
      );
      if (required.length > 0 && required.some((a) => a.status !== 'APPROVED')) {
        setStepError('לא ניתן להשלים - נדרש אישור CEO');
        return;
      }
    }

    await performComplete(step);
  }

  async function handleSaveLinkAndComplete(step: StepRow) {
    const link = (stepLinks[step.id] ?? '').trim();
    if (!link) { setStepError('נדרש קישור'); return; }
    setStepError(null);
    setEditingLinkStepId(null);
    // Save fixcar link first
    if (step.step_key === 'FIXCAR_PHOTOS') {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      await supabase.from('cases').update({ fixcar_link: link } as never).eq('id', caseId);
      setFixcarValue(link);
    }
    await performComplete(step, link);
  }

  async function handleWheelsConfirm(step: StepRow) {
    setStepError(null);
    setWheelsUploading(true);
    try {
      const supabase = (await import('@/lib/supabase/client')).createClient();

      if (wheelsMode === 'link') {
        const link = wheelsLinkValue.trim();
        if (!link) { setStepError('נדרש קישור'); setWheelsUploading(false); return; }
        await supabase.from('cases').update({ wheels_check_link: link } as never).eq('id', caseId);
      } else {
        if (!wheelsFile) { setStepError('נדרש קובץ'); setWheelsUploading(false); return; }
        const { uploadCaseDocument: uploadDoc } = await import('@/app/actions/documents');
        const formData = new FormData();
        formData.append('case_id', caseId);
        formData.append('file', wheelsFile);
        const uploadRes = await uploadDoc(formData);
        if (uploadRes?.error) { setStepError(uploadRes.error); setWheelsUploading(false); return; }
        // Refresh documents list
        const { data: docsData } = await supabase
          .from('case_documents')
          .select('id, file_name, file_path, file_size, mime_type, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });
        if (docsData) setLocalDocuments(docsData as typeof documents);
      }

      setWheelsCheckPanelStepId(null);
      setWheelsFile(null);
      await performComplete(step);
    } finally {
      setWheelsUploading(false);
    }
  }

  async function handleReturnToEstimate() {
    setReturning(true);
    try {
      const res = await returnToEstimate(caseId);
      if (res?.error) setStepError(res.error);
      else router.refresh();
    } finally {
      setReturning(false);
    }
  }

  const [deletingCase, setDeletingCase] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handleDeleteCase() {
    setDeletingCase(true);
    try {
      const res = await deleteCase(caseId);
      if (res?.error) {
        setStepError(res.error);
        setDeleteConfirm(false);
      } else {
        router.push('/cases');
      }
    } finally {
      setDeletingCase(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <Link href="/cases" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
          <span>←</span>
          <span>חזרה לתיקים</span>
        </Link>
        {role === 'CEO' && (
          deleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-700 font-medium">למחוק תיק זה לצמיתות?</span>
              <button
                type="button"
                onClick={() => void handleDeleteCase()}
                disabled={deletingCase}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deletingCase ? 'מוחק...' : 'כן, מחק'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs font-semibold hover:bg-gray-300"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-semibold hover:bg-red-100"
            >
              🗑 מחק תיק
            </button>
          )
        )}
      </div>

      {/* ── פרטי תיק ── */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
          <span className="text-2xl">📋</span>
          פרטי תיק
          {canEditDetails && (
            <span className="text-xs font-normal text-gray-400 mr-1">(לחץ על ערך לעריכה)</span>
          )}
        </h2>

        {fieldSaveError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            ⚠️ {fieldSaveError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          {/* Read-only fields */}
          <InfoRow label="סניף" value={branchName} />
          <InfoRow label="נפתח" value={openedAt ? new Date(openedAt).toLocaleDateString('he-IL') : '—'} />
          <InfoRow label="גיל רכב" value={displayAge} />

          {/* Editable car fields */}
          <EditableInfoRow label="רישוי" field="plate" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="יצרן" field="carMake" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="דגם" field="carModel" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="סוג רכב" field="vehicleType" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="שנת ייצור" field="vehicleYear" type="number" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="מספר שלדה" field="carVin" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />

          {/* Editable case fields */}
          <EditableInfoRow label="מספר תביעה" field="claimNumber" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="שם לקוח" field="customerName" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="טלפון" field="phone" type="tel" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="חברת ביטוח" field="insuranceCompany" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="שמאי" field="appraiserName" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow label="תאריך אירוע" field="eventDate" type="date" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} />
          <EditableInfoRow
            label="סוג ביטוח" field="insuranceType" type="select"
            options={[
              { value: 'COMPREHENSIVE', label: 'מקיף' },
              { value: 'THIRD_PARTY', label: "צד ג'" },
              { value: 'PRIVATE', label: 'פרטי' },
              { value: 'OTHER', label: 'אחר' },
            ]}
            displayMap={INSURANCE_TYPE_LABELS}
            fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit}
          />
          <EditableInfoRow
            label="סוג תביעה" field="claimType" type="select"
            options={[
              { value: 'PRIVATE', label: 'פרטי' },
              { value: 'ACCIDENT', label: 'תאונה' },
              { value: 'FLOOD', label: 'הצפה' },
            ]}
            displayMap={CLAIM_TYPE_LABELS}
            fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit}
          />
          <EditableInfoRow
            label="תת סוג תביעה" field="subClaimType" type="select"
            options={[
              { value: 'POLICY', label: 'פוליסה' },
              { value: 'THIRD_PARTY', label: "צד ג'" },
              { value: 'THIRD_PARTY_SETTLEMENT', label: "הסדר ג'" },
              { value: 'PRIVATE_REPAIR', label: 'תיקון פרטי' },
              { value: 'SHLOMO_POLICY', label: 'מוקד שלמה פוליסה' },
              { value: 'SHLOMO_THIRD_PARTY', label: "מוקד שלמה צד ג'" },
            ]}
            displayMap={SUB_CLAIM_LABELS}
            fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit}
          />
        </div>

        {canEdit && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium mb-1">סטטוס חלקים</label>
            <div className="flex items-center gap-3">
              <select
                value={partsValue}
                onChange={(e) => void savePartsStatus(e.target.value as PartsStatus)}
                className="border rounded px-3 py-2 text-sm"
              >
                {(Object.entries(PARTS_STATUS_LABELS) as [PartsStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {updatingParts && <span className="text-sm text-gray-500">שומר...</span>}
            </div>
            {partsStatusMessage && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                ✓ {partsStatusMessage}
              </div>
            )}
          </div>
        )}

        {/* ── סטטוס פחח ── */}
        {(canEdit || role === 'PAINTER') && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">סטטוס פחח</label>
            <select
              value={painterStatus}
              onChange={(e) => void savePainterStatus(e.target.value as PainterStatus | '')}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none"
            >
              <option value="">— לא הוגדר —</option>
              {(Object.entries(PAINTER_STATUS_LABELS) as [PainterStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {painterStatus === 'READY_FOR_RELEASE' && (
              <span className="mr-3 text-sm font-medium text-green-700">✓ מוכן לשחרור</span>
            )}
          </div>
        )}

        {/* ── הערות ── */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            הערות
            {notesSaving && <span className="mr-2 text-xs font-normal text-gray-400">שומר...</span>}
            {notes && !notesDirty && !notesSaving && (
              <span className="mr-2 text-xs font-normal text-gray-400">✓</span>
            )}
          </label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            onBlur={() => void saveNotes()}
            rows={3}
            placeholder={canEditDetails ? 'הוסף הערה...' : 'אין הערות'}
            readOnly={!canEditDetails}
            className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none outline-none transition-all ${
              canEditDetails
                ? 'focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 bg-gray-50 focus:bg-white'
                : 'bg-gray-50 text-gray-600 cursor-default'
            }`}
          />
        </div>
      </div>

      {/* ── צ'קליסט עבודה ── */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
          <span className="text-2xl">✅</span>
          צ&apos;קליסט עבודה
        </h2>

        {orderedSteps.length === 0 ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">⚠️ אין שלבים להצגה</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {orderedSteps.map((s, index) => {
              const isDone = s.state === 'DONE';
              const isSkipped = s.state === 'SKIPPED';
              const isActive = s.state === 'ACTIVE';
              const label = STEP_LABELS[s.step_key] ?? s.step_key ?? `שלב ${index + 1}`;
              const savedLink = stepLinks[s.id] || (s.step_key === 'FIXCAR_PHOTOS' ? fixcarValue : '');
              const hasLink = savedLink.trim().length > 0;
              const hasWheelsLink = s.step_key === 'WHEELS_CHECK' && wheelsCheckLink;

              let isBlocked = false;
              let blockReason = '';
              let showWarning = false;
              let warningMessage = '';

              if (!isDone && !isSkipped) {
                if (s.step_key === 'ENTER_WORK' && partsValue !== 'AVAILABLE') {
                  showWarning = true;
                  warningMessage = `חלקים לא זמינים — סטטוס נוכחי: ${PARTS_STATUS_LABELS[partsValue] ?? partsValue}`;
                } else if (s.step_key === 'READY_FOR_OFFICE') {
                  const hasExtrasInTreatment = extras.some((e) => e.status === 'IN_TREATMENT');
                  const requiredApprovals = effectiveApprovals.filter(
                    (a) => a.approval_type === 'ESTIMATE_AND_DETAILS' || a.approval_type === 'WHEELS_CHECK'
                  );
                  const hasRejectedOrMissing = requiredApprovals.length > 0 && requiredApprovals.some((a) => a.status !== 'APPROVED');
                  if (hasExtrasInTreatment || hasRejectedOrMissing) {
                    isBlocked = true;
                    blockReason = hasExtrasInTreatment ? 'תוספות בטיפול' : 'נדרש אישור CEO';
                  }
                }
              }

              const isWheelsPanel = wheelsCheckPanelStepId === s.id;
              const isLinkPanel = editingLinkStepId === s.id;

              return (
                <li key={s.id} className="space-y-2">
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isActive
                        ? isBlocked
                          ? 'bg-yellow-50 border-yellow-300'
                          : 'bg-blue-50 border-blue-300'
                        : isDone
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        isDone
                          ? 'bg-green-500 text-white'
                          : isSkipped
                            ? 'bg-gray-300 text-gray-500'
                            : isActive
                              ? isBlocked
                                ? 'bg-yellow-500 text-white'
                                : 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {isDone ? '✓' : isSkipped ? '—' : isBlocked ? '⚠' : index + 1}
                    </div>
                    <div className="flex-1">
                      <span
                        className={`text-sm font-medium ${
                          isDone
                            ? 'text-green-700 line-through'
                            : isSkipped
                              ? 'text-gray-400'
                              : isBlocked
                                ? 'text-yellow-800'
                                : 'text-gray-700'
                        }`}
                      >
                        {label}
                      </span>
                      {isSkipped && <span className="mr-2 text-xs text-gray-400">(דולג)</span>}
                      {isBlocked && blockReason && (
                        <span className="mr-2 text-xs text-yellow-700 font-normal">({blockReason})</span>
                      )}
                    </div>

                    {canEdit && !isDone && !isSkipped && (
                      <button
                        type="button"
                        disabled={completingStepId === s.id || (isBlocked && !STEPS_REQUIRING_LINK.has(s.step_key) && !STEPS_REQUIRING_FILE_OR_LINK.has(s.step_key))}
                        onClick={() => void handleComplete(s)}
                        className={`px-3 py-1 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                          isBlocked
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        title={isBlocked ? blockReason : undefined}
                      >
                        {completingStepId === s.id ? 'מבצע...' : isBlocked ? 'חסום' : 'סמן בוצע'}
                      </button>
                    )}
                  </div>

                  {/* Warning for ENTER_WORK when parts not available */}
                  {showWarning && warningMessage && (
                    <div className="mr-11 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800 flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{warningMessage}</span>
                      </p>
                    </div>
                  )}

                  {/* ENTER_WORK sub-status */}
                  {s.step_key === 'ENTER_WORK' && canEdit && (
                    <div className="mr-11 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-blue-700 mb-1">סטטוס חלקים</p>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={partsOrdered === true}
                          onChange={() => void togglePartsOrdered()}
                          className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                        />
                        הוזמן חלקים
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={partsArrived === true}
                          onChange={() => void togglePartsArrived()}
                          className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                        />
                        הגיע חלקים
                      </label>
                    </div>
                  )}


                  {/* QUALITY_CONTROL — assignee */}
                  {s.step_key === 'QUALITY_CONTROL' && canEdit && (
                    <div className="mr-11 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs font-semibold text-gray-600 mb-2">מבצע בקרת איכות</p>
                      <select
                        value={qcAssignee}
                        onChange={(e) => void saveQcAssignee(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-brand-red outline-none"
                      >
                        <option value="">— בחר —</option>
                        <option value="נסיה">נסיה</option>
                        <option value="ערן">ערן</option>
                        <option value="עמית">עמית</option>
                      </select>
                      {qcAssignee && (
                        <span className="mr-3 text-sm text-gray-600">✓ {qcAssignee}</span>
                      )}
                    </div>
                  )}

                  {/* FIXCAR link display */}
                  {isDone && hasLink && s.step_key === 'FIXCAR_PHOTOS' && (
                    <div className="mr-11 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600">קישור FixCar:</span>
                        <a
                          href={savedLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 underline truncate flex-1"
                          dir="ltr"
                        >
                          {savedLink}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* WHEELS CHECK link/file display after done */}
                  {isDone && hasWheelsLink && s.step_key === 'WHEELS_CHECK' && (
                    <div className="mr-11 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600">קישור טפסי גלגלים:</span>
                        <a
                          href={wheelsCheckLink!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 underline truncate flex-1"
                          dir="ltr"
                        >
                          {wheelsCheckLink}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* FIXCAR link popup */}
                  {canEdit && isLinkPanel && STEPS_REQUIRING_LINK.has(s.step_key) && !isDone && !isSkipped && (
                    <div className="mr-11 mt-1 p-3 bg-white rounded-lg border border-blue-300 shadow-md">
                      <p className="text-xs font-semibold text-blue-700 mb-2">🔗 הוסף קישור ל-{label}</p>
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          type="url"
                          value={stepLinks[s.id] ?? (s.step_key === 'FIXCAR_PHOTOS' ? fixcarValue : '')}
                          onChange={(e) => {
                            const v = e.target.value;
                            setStepLinks((prev) => ({ ...prev, [s.id]: v }));
                            if (s.step_key === 'FIXCAR_PHOTOS') setFixcarValue(v);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveLinkAndComplete(s);
                            if (e.key === 'Escape') setEditingLinkStepId(null);
                          }}
                          className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          dir="ltr"
                          placeholder="https://..."
                        />
                        <button
                          type="button"
                          disabled={completingStepId === s.id}
                          onClick={() => void handleSaveLinkAndComplete(s)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                        >
                          {completingStepId === s.id ? '⏳' : '✓ אישור'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLinkStepId(null)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-200"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WHEELS CHECK file/link panel */}
                  {canEdit && isWheelsPanel && STEPS_REQUIRING_FILE_OR_LINK.has(s.step_key) && !isDone && !isSkipped && (
                    <div className="mr-11 mt-1 p-4 bg-white rounded-lg border border-purple-300 shadow-md">
                      <p className="text-xs font-semibold text-purple-700 mb-3">📎 הוסף לינק או קובץ לטפסי גלגלים</p>
                      {/* Tab switcher */}
                      <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
                        <button
                          type="button"
                          onClick={() => setWheelsMode('link')}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            wheelsMode === 'link' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600'
                          }`}
                        >
                          🔗 קישור
                        </button>
                        <button
                          type="button"
                          onClick={() => setWheelsMode('file')}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            wheelsMode === 'file' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600'
                          }`}
                        >
                          📁 קובץ
                        </button>
                      </div>

                      {wheelsMode === 'link' ? (
                        <input
                          autoFocus
                          type="url"
                          value={wheelsLinkValue}
                          onChange={(e) => setWheelsLinkValue(e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                          dir="ltr"
                          placeholder="https://..."
                        />
                      ) : (
                        <input
                          type="file"
                          onChange={(e) => setWheelsFile(e.target.files?.[0] ?? null)}
                          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                        />
                      )}

                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          disabled={wheelsUploading || completingStepId === s.id}
                          onClick={() => void handleWheelsConfirm(s)}
                          className="px-4 py-1.5 bg-purple-600 text-white rounded-md text-xs font-semibold hover:bg-purple-700 disabled:opacity-50"
                        >
                          {wheelsUploading ? '⏳ מעלה...' : '✓ אישור והשלמת שלב'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setWheelsCheckPanelStepId(null); setWheelsFile(null); }}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-200"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {stepError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">⚠️ {stepError}</p>
          </div>
        )}

        {canEdit && (
          <div className="mt-2">
            <button
              type="button"
              disabled={returning}
              onClick={() => void handleReturnToEstimate()}
              className="text-sm text-amber-600 underline"
            >
              {returning ? '...' : 'החזר לאומדן'}
            </button>
          </div>
        )}
      </div>

      {/* ── מסמכים ── */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">📎</span>
            מסמכים וקבצים
          </h2>
          {canEdit && (
            <label className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors">
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setDocumentError(null);
                  setUploadingDocument(true);
                  const formData = new FormData();
                  formData.append('case_id', caseId);
                  formData.append('file', file);
                  const res = await uploadCaseDocument(formData);
                  if (res?.error) {
                    setDocumentError(res.error);
                  } else {
                    const supabase = createClient();
                    const { data } = await supabase
                      .from('case_documents')
                      .select('id, file_name, file_path, file_size, mime_type, created_at')
                      .eq('case_id', caseId)
                      .order('created_at', { ascending: false });
                    if (data) setLocalDocuments(data as typeof documents);
                    e.target.value = '';
                  }
                  setUploadingDocument(false);
                }}
                disabled={uploadingDocument}
              />
              {uploadingDocument ? 'מעלה...' : '+ הוסף קובץ'}
            </label>
          )}
        </div>
        {documentError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            ⚠️ {documentError}
          </div>
        )}
        {localDocuments.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-sm">אין קבצים להצגה</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {localDocuments.map((doc) => {
              const supabase = createClient();
              const { data: urlData } = supabase.storage.from('case-documents').getPublicUrl(doc.file_path);
              const fileSize = doc.file_size ? (doc.file_size / 1024).toFixed(1) + ' KB' : '—';
              const isImage = doc.mime_type?.startsWith('image/');
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 text-2xl">{isImage ? '🖼️' : '📄'}</div>
                    <div className="flex-1 min-w-0">
                      <a
                        href={urlData.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block"
                      >
                        {doc.file_name}
                      </a>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {fileSize} • {new Date(doc.created_at).toLocaleDateString('he-IL')}
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('האם אתה בטוח שברצונך למחוק קובץ זה?')) return;
                        const res = await deleteCaseDocument(doc.id);
                        if (res?.error) {
                          setDocumentError(res.error);
                        } else {
                          setLocalDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                        }
                      }}
                      className="flex-shrink-0 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                    >
                      🗑️ מחק
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ציר זמן ── */}
      {timeline.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
            <span className="text-2xl">⏱️</span>
            ציר זמן
          </h2>
          <div className="relative">
            <div className="absolute right-6 top-0 bottom-0 w-0.5 bg-blue-200" />
            <div className="space-y-4">
              {timeline.map((item) => (
                <div key={item.id} className="relative flex items-start gap-4 pr-6">
                  <div
                    className={`flex-shrink-0 w-4 h-4 rounded-full mt-1 z-10 ${
                      item.type === 'case' ? 'bg-blue-500' : 'bg-green-500'
                    }`}
                  />
                  <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-800">{item.stepLabel}</div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                          <span>🕐</span>
                          <span>
                            {new Date(item.timestamp).toLocaleString('he-IL', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {item.performedBy && (
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <span>👤</span>
                            <span>בוצע על ידי: {item.performedBy}</span>
                          </div>
                        )}
                      </div>
                      {item.type === 'step' && (
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ הושלם
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-gray-500 font-medium min-w-[7.5rem] flex-shrink-0">{label}:</span>
      <span className="text-gray-800">{value || '—'}</span>
    </div>
  );
}

function EditableInfoRow({
  label,
  field,
  type = 'text',
  options,
  displayMap,
  fieldValues,
  editingField,
  editValue,
  canEdit,
  onStartEdit,
  onEditChange,
  onSave,
  onCancel,
}: {
  label: string;
  field: string;
  type?: 'text' | 'tel' | 'date' | 'number' | 'select';
  options?: { value: string; label: string }[];
  displayMap?: Record<string, string>;
  fieldValues: Record<string, string>;
  editingField: string | null;
  editValue: string;
  canEdit: boolean;
  onStartEdit: (field: string, value: string) => void;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEditing = editingField === field;
  const rawValue = fieldValues[field] ?? '';

  let displayValue = rawValue || '—';
  if (rawValue && displayMap && displayMap[rawValue]) {
    displayValue = displayMap[rawValue];
  }
  if (type === 'date' && rawValue) {
    try {
      displayValue = new Date(rawValue).toLocaleDateString('he-IL');
    } catch {
      displayValue = rawValue;
    }
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-gray-500 font-medium min-w-[7.5rem] flex-shrink-0">{label}:</span>
      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {type === 'select' && options ? (
            <select
              autoFocus
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
              className="flex-1 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={type}
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
              className="flex-1 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
              dir={type === 'tel' ? 'ltr' : undefined}
            />
          )}
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-xs px-1">✕</button>
        </div>
      ) : (
        <span
          className={`text-gray-800 flex-1 ${canEdit ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-blue-50 hover:text-blue-700 transition-colors' : ''}`}
          onClick={canEdit ? () => onStartEdit(field, rawValue) : undefined}
          title={canEdit ? `לחץ לעריכת ${label}` : undefined}
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}
