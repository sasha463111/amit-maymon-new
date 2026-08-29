'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteCase } from '@/app/actions/workflow';
import { updateCaseDetails } from '@/app/actions/caseDetails';
import { uploadCaseDocument, deleteCaseDocument, getSignedFileUrls } from '@/app/actions/documents';
import { createClient } from '@/lib/supabase/client';
import type { PartsStatus } from '@/types/database';
import { PROFESSIONAL_STEP_LABELS as DEFAULT_STEP_LABELS } from '@/types/database';
import { CaseStatusBanner } from './CaseStatusBanner';
import { DocumentsSection } from './DocumentsSection';
import { TimelineSection } from './TimelineSection';
import { CaseDetailsSection } from './CaseDetailsSection';
import { WorkflowStepsSection } from './WorkflowStepsSection';

type StepRow = {
  id: string;
  step_key: string;
  state: string;
  order_index: number;
  completed_at?: string | null;
  completed_by?: string | null;
  activated_at?: string | null;
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
  documents: { id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; document_type?: string | null; created_at: string }[];
  role: string | null;
  userNames: Record<string, string>;
  stepTemplates: StepTemplate[];
  notes: string | null;
  partsOrdered: boolean | null;
  partsArrived: boolean | null;
  qcAssignee: string | null;
  estimateLink: string | null;
  painterStatus: string | null;
  painterStatusOtherText: string | null;
  appraiserStatus: string | null;
  carAgeYears: number | null;
  bodyworkAdvisors: { id: string; full_name: string }[];
  // Session 6 (migration 020)
  enterWorkChecklistState: string[];
  catalogNumbersAssignee: string | null;
  partsDiscountsAssignee: string | null;
  completionPhotosAssignee: string | null;
  // Session 7 — status banner
  treatmentFinishedAt?: string | null;
  closedAt?: string | null;
}

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
    painterStatusOtherText: initialPainterStatusOtherText,
    appraiserStatus: initialAppraiserStatus,
    carAgeYears,
    bodyworkAdvisors,
    enterWorkChecklistState: initialEnterWorkChecklistState,
    catalogNumbersAssignee: initialCatalogNumbersAssignee,
    partsDiscountsAssignee: initialPartsDiscountsAssignee,
    completionPhotosAssignee: initialCompletionPhotosAssignee,
  } = props;

  const router = useRouter();

  // Compute step labels from templates (fall back to defaults). Shared by
  // this file's own timeline/status-banner derivations AND passed down to
  // WorkflowStepsSection (which needs the same labels for the checklist).
  const STEP_LABELS = useMemo(() => {
    const map: Record<string, string> = { ...DEFAULT_STEP_LABELS };
    for (const t of stepTemplates) {
      map[t.step_key] = t.step_label;
    }
    return map;
  }, [stepTemplates]);

  // SERVICE_ADVISOR is a full professional-workflow editor (same as a manager):
  // create cases, upload files/links to steps, and advance steps. Keep the
  // completeActiveStep backend gate in sync with this list.
  const canEdit = role === 'SERVICE_MANAGER' || role === 'CEO' || role === 'SERVICE_ADVISOR';

  // Field-editing/notes/painter-status state moved into CaseDetailsSection.tsx
  // (self-contained), and everything about individual workflow steps
  // (popups, panels, per-step handlers) moved into WorkflowStepsSection.tsx.
  // `localSteps` itself stays here — CaseStatusBanner's active-step label and
  // TimelineSection's completed-step entries both derive from it, so it's
  // passed down to WorkflowStepsSection as a controlled value/setter pair
  // rather than owned there. See the comment at the top of that file.

  const [localSteps, setLocalSteps] = useState<StepRow[]>(steps);
  const effectiveSteps = localSteps;

  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [localDocuments, setLocalDocuments] = useState(documents);
  // Signed URLs for the case-documents bucket (private). Keyed by file_path.
  // Refreshed whenever localDocuments changes so newly uploaded docs become
  // viewable without a page reload.
  const [signedDocUrls, setSignedDocUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = localDocuments.map((d) => d.file_path).filter(Boolean);
    if (paths.length === 0) {
      setSignedDocUrls({});
      return;
    }
    let cancelled = false;
    getSignedFileUrls('case-documents', paths, 3600)
      .then((urls) => {
        if (!cancelled) setSignedDocUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setSignedDocUrls({});
      });
    return () => {
      cancelled = true;
    };
  }, [localDocuments]);

  // Uploads any number of files at once (parallel, not one-at-a-time) — a
  // selfie's worth of insurance paperwork is easily 4-5 photos, and making
  // someone repeat the file/camera picker for each one is exactly the kind
  // of friction that gets a task skipped or done later "when there's time".
  async function uploadDocuments(files: File[]) {
    setDocumentError(null);
    setUploadingDocument(true);
    const results = await Promise.all(
      files.map(async (file) => {
        const formData = new FormData();
        formData.append('case_id', caseId);
        formData.append('file', file);
        return uploadCaseDocument(formData);
      })
    );
    const errors = results.filter((r) => r?.error).map((r) => r!.error as string);
    if (errors.length > 0) {
      setDocumentError(
        errors.length === results.length
          ? errors[0]
          : `${results.length - errors.length}/${results.length} קבצים הועלו בהצלחה. שגיאה: ${errors[0]}`
      );
    }
    const supabase = createClient();
    const { data } = await supabase
      .from('case_documents')
      .select('id, file_name, file_path, file_size, mime_type, document_type, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (data) setLocalDocuments(data as typeof documents);
    setUploadingDocument(false);
  }

  async function deleteDocument(docId: string) {
    if (!confirm('האם אתה בטוח שברצונך למחוק קובץ זה?')) return;
    const res = await deleteCaseDocument(docId);
    if (res?.error) {
      setDocumentError(res.error);
    } else {
      setLocalDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
  }

  const initRef = useRef<string | null>(null);

  // Seed fixcar link
  // (The "seed fixcar link into stepLinks" effect that used to live here
  // moved into WorkflowStepsSection.tsx along with stepLinks itself.)

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
        .select('id, step_key, state, order_index, completed_at, completed_by, activated_at')
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

  // (orderedSteps — the carAgeYears-filtered, order_index-sorted view used
  // for rendering — moved into WorkflowStepsSection.tsx; it's only used
  // there, so it's recomputed from the `steps` prop rather than shared.)

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

  const [deletingCase, setDeletingCase] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Was `setStepError` before the workflow-steps extraction — that state (and
  // its error banner) moved into WorkflowStepsSection.tsx, so a delete
  // failure needs its own place to show up now. Given its own inline banner
  // next to the delete button below instead, since showing a "case delete
  // failed" error inside the unrelated checklist card was itself accidental
  // coupling, not deliberate design.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteCase() {
    setDeletingCase(true);
    try {
      const res = await deleteCase(caseId);
      if (res?.error) {
        setDeleteError(res.error);
        setDeleteConfirm(false);
      } else {
        router.push('/cases');
      }
    } finally {
      setDeletingCase(false);
    }
  }

  // ── Session 7 — case status banner: makes it instantly obvious where this case is.
  const activeProfessionalStepLabel = useMemo(() => {
    const PROFESSIONAL_KEYS = new Set([
      'OPEN_CASE','FIXCAR_PHOTOS','WHEELS_CHECK','PREP_ESTIMATE','SEND_TO_APPRAISER',
      'WAIT_APPRAISER_APPROVAL','ENTER_WORK','ISSUE_CATALOG_NUMBERS','PARTS_DISCOUNTS',
      'QUALITY_CONTROL','WASH','SEND_COMPLETION_PHOTOS','READY_FOR_OFFICE',
    ]);
    const active = localSteps.find((s) => PROFESSIONAL_KEYS.has(s.step_key) && s.state === 'ACTIVE');
    if (!active) return null;
    return STEP_LABELS[active.step_key] ?? active.step_key;
  }, [localSteps, STEP_LABELS]);

  const isClosed = !!props.closedAt;
  const isInClosure = !isClosed && !!props.treatmentFinishedAt;
  const isActive = !isClosed && !isInClosure;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Case status banner — top-of-page, color-coded so the user sees state at a glance */}
      <CaseStatusBanner
        isClosed={isClosed}
        closedAt={props.closedAt}
        isInClosure={isInClosure}
        treatmentFinishedAt={props.treatmentFinishedAt}
        isActive={isActive}
        activeProfessionalStepLabel={activeProfessionalStepLabel}
        role={role}
        caseId={caseId}
      />

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
      {deleteError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {deleteError}
        </div>
      )}

      {/* ── פרטי תיק ── */}
      <CaseDetailsSection
        caseId={caseId}
        role={role}
        branchName={branchName}
        openedAt={openedAt}
        age={age}
        plate={plate}
        claimNumber={claimNumber}
        customerName={customerName}
        phone={phone}
        insuranceCompany={insuranceCompany}
        appraiserName={appraiserName}
        eventDate={eventDate}
        insuranceType={insuranceType}
        claimType={claimType}
        subClaimType={subClaimType}
        carMake={carMake}
        carModel={carModel}
        carVin={carVin}
        vehicleType={vehicleType}
        vehicleYear={vehicleYear}
        initialNotes={initialNotes}
        initialPainterStatus={initialPainterStatus}
        initialPainterStatusOtherText={initialPainterStatusOtherText}
      />

      {/* ── צ'קליסט עבודה ── */}
      <WorkflowStepsSection
        caseId={caseId}
        role={role}
        steps={localSteps}
        onStepsChange={setLocalSteps}
        stepTemplates={stepTemplates}
        stepLabels={STEP_LABELS}
        carAgeYears={carAgeYears}
        fixcarLink={fixcarLink}
        wheelsCheckLink={wheelsCheckLink}
        partsStatus={partsStatus}
        approvals={approvals}
        extras={extras}
        bodyworkAdvisors={bodyworkAdvisors}
        generalStatus={props.generalStatus}
        initialQcAssignee={initialQcAssignee}
        initialAppraiserStatus={initialAppraiserStatus}
        initialCatalogNumbersAssignee={initialCatalogNumbersAssignee}
        initialPartsDiscountsAssignee={initialPartsDiscountsAssignee}
        initialCompletionPhotosAssignee={initialCompletionPhotosAssignee}
        initialEnterWorkChecklistState={initialEnterWorkChecklistState}
        initialPartsOrdered={initialPartsOrdered}
        initialPartsArrived={initialPartsArrived}
        onDocumentsChange={setLocalDocuments}
      />

      {/* ── מסמכים ── */}
      <DocumentsSection
        documents={localDocuments}
        signedDocUrls={signedDocUrls}
        canEdit={canEdit}
        documentError={documentError}
        uploadingDocument={uploadingDocument}
        onUploadFiles={uploadDocuments}
        onDeleteDocument={deleteDocument}
      />

      {/* ── ציר זמן ── */}
      <TimelineSection items={timeline} />
    </div>
  );
}
