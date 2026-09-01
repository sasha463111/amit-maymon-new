'use client';

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { completeActiveStep, returnToEstimate } from '@/app/actions/workflow';
import { updateCaseDetails } from '@/app/actions/caseDetails';
import { uploadCaseDocument } from '@/app/actions/documents';
import { createClient } from '@/lib/supabase/client';
import type { PartsStatus } from '@/types/database';
import { PARTS_STATUS_LABELS } from '@/types/database';
import type { CaseDocument } from './DocumentsSection';

/**
 * Extracted from CaseDetailClientV2.tsx — the largest, highest-effort step
 * of the god-component refactor. Unlike DocumentsSection (state mostly
 * lifted) or CaseDetailsSection (state fully self-contained), this one is a
 * hybrid: `steps` itself has to stay lifted in the parent (CaseStatusBanner
 * needs the active-step label derived from it, TimelineSection needs it for
 * completed-step entries) and is passed down as a controlled
 * value/setter pair — but every popup/panel/handler that operates ON a step
 * (link entry, wheels-check upload, QC advisor picker, "by whom" popup,
 * final-estimate upload, ENTER_WORK sub-checklist, appraiser-status buttons)
 * was verified to be used nowhere else in the parent, so all of that moved
 * in fully as private state.
 */

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

type ApprovalRow = { id: string; approval_type: string; status: string; rejection_note: string | null };

// Steps that ask "by whom?" before completing.
const ASSIGNEE_FIELD_BY_STEP: Record<string, 'catalog_numbers_assignee' | 'parts_discounts_assignee' | 'completion_photos_assignee'> = {
  ISSUE_CATALOG_NUMBERS: 'catalog_numbers_assignee',
  PARTS_DISCOUNTS: 'parts_discounts_assignee',
  SEND_COMPLETION_PHOTOS: 'completion_photos_assignee',
};

// Sub-checklist items for ENTER_WORK (advisory — does not block step completion).
const ENTER_WORK_CHECKLIST_ITEMS = ['רץ גלגלים', 'הודפסו גלגלים אחרי שעה מינימום'];

// Prepend https:// if the user-entered URL has no scheme — prevents browsers from
// interpreting it as a relative path under /cases/[id].
function normalizeUrl(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function WorkflowStepsSection({
  caseId,
  role,
  steps,
  onStepsChange,
  stepTemplates,
  stepLabels,
  carAgeYears,
  fixcarLink,
  wheelsCheckLink,
  partsStatus,
  approvals,
  extras,
  bodyworkAdvisors,
  generalStatus,
  initialQcAssignee,
  initialAppraiserStatus,
  initialCatalogNumbersAssignee,
  initialPartsDiscountsAssignee,
  initialCompletionPhotosAssignee,
  initialEnterWorkChecklistState,
  initialPartsOrdered,
  initialPartsArrived,
  onDocumentsChange,
}: {
  caseId: string;
  role: string | null;
  steps: StepRow[];
  onStepsChange: Dispatch<SetStateAction<StepRow[]>>;
  stepTemplates: StepTemplate[];
  stepLabels: Record<string, string>;
  carAgeYears: number | null;
  fixcarLink: string | null;
  wheelsCheckLink: string | null;
  partsStatus: PartsStatus;
  approvals: ApprovalRow[];
  extras: { id: string; description: string; status: string }[];
  bodyworkAdvisors: { id: string; full_name: string }[];
  generalStatus: string;
  initialQcAssignee: string | null;
  initialAppraiserStatus: string | null;
  initialCatalogNumbersAssignee: string | null;
  initialPartsDiscountsAssignee: string | null;
  initialCompletionPhotosAssignee: string | null;
  initialEnterWorkChecklistState: string[];
  initialPartsOrdered: boolean | null;
  initialPartsArrived: boolean | null;
  onDocumentsChange: Dispatch<SetStateAction<CaseDocument[]>>;
}) {
  const router = useRouter();
  const canEdit = role === 'SERVICE_MANAGER' || role === 'CEO' || role === 'SERVICE_ADVISOR';

  // ?highlight=<step_key> — set on notification action_urls that point at a
  // specific workflow step (e.g. the blocked step or the step whose
  // completion just fired the notification) so the recipient lands scrolled
  // to it instead of having to scan the whole step list.
  const searchParams = useSearchParams();
  const highlightStepKey = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightStepKey) return;
    document.getElementById(`step-${highlightStepKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PREP_ESTIMATE never requires a link/file — documents section handles uploads
  const STEPS_REQUIRING_LINK = useMemo(
    () => new Set(stepTemplates.filter((t) => t.requires_link && t.step_key !== 'PREP_ESTIMATE').map((t) => t.step_key)),
    [stepTemplates]
  );
  const STEPS_REQUIRING_FILE_OR_LINK = useMemo(
    () => new Set(stepTemplates.filter((t) => t.requires_file_or_link && t.step_key !== 'PREP_ESTIMATE').map((t) => t.step_key)),
    [stepTemplates]
  );

  const orderedSteps = useMemo(() => {
    const sorted = [...steps].sort((a, b) => a.order_index - b.order_index);
    // Hide WHEELS_CHECK entirely for cars under 2 years old
    if (carAgeYears !== null && carAgeYears < 2) {
      return sorted.filter((s) => s.step_key !== 'WHEELS_CHECK');
    }
    return sorted;
  }, [steps, carAgeYears]);

  const [localApprovals] = useState<ApprovalRow[]>(approvals);
  const effectiveApprovals = localApprovals;

  const [partsOrdered, setPartsOrdered] = useState<boolean | null>(initialPartsOrdered ?? null);
  const [partsArrived, setPartsArrived] = useState<boolean | null>(initialPartsArrived ?? null);
  const [qcAssignee, setQcAssignee] = useState(initialQcAssignee ?? '');
  const [appraiserStatus, setAppraiserStatus] = useState<string>(initialAppraiserStatus ?? '');

  async function saveAppraiserStatus(val: string) {
    setAppraiserStatus(val);
    const res = await updateCaseDetails(caseId, { appraiser_status: val || null });
    if (res?.error) console.error('[saveAppraiserStatus] failed', res.error);
  }

  async function togglePartsOrdered() {
    const next = !partsOrdered;
    setPartsOrdered(next);
    await updateCaseDetails(caseId, { parts_ordered: next });
  }

  async function togglePartsArrived() {
    const next = !partsArrived;
    setPartsArrived(next);
    // Go through updatePainterChecklist (not updateCaseDetails) so the
    // "חלקים הגיעו" push notification fires when this flips to true.
    const { updatePainterChecklist } = await import('@/app/actions/painter');
    await updatePainterChecklist(caseId, { parts_arrived: next });
  }

  async function saveQcAssignee(val: string) {
    setQcAssignee(val);
    await updateCaseDetails(caseId, { qc_assignee: val || null });
  }

  // NOTE: savePartsStatus below is dead code carried over verbatim from
  // CaseDetailClientV2.tsx (grepped the whole src/ tree — it's never called
  // from anywhere). Not removing it as part of this extraction; that's a
  // separate cleanup decision nobody's asked for. partsValue itself IS live
  // — read (not written) below for the ENTER_WORK warning message.
  const [partsValue, setPartsValue] = useState<PartsStatus>(partsStatus);
  const [fixcarValue, setFixcarValue] = useState(fixcarLink ?? '');
  const [updatingParts, setUpdatingParts] = useState(false);
  const [partsStatusMessage, setPartsStatusMessage] = useState<string | null>(null);

  async function savePartsStatus(v: PartsStatus) {
    if (!canEdit) return;
    const oldValue = partsValue;
    setPartsValue(v);
    setUpdatingParts(true);
    try {
      const res = await updateCaseDetails(caseId, { parts_status: v });
      if (res?.error) {
        console.error('[savePartsStatus] failed', res.error);
      } else if (oldValue !== v) {
        setPartsStatusMessage(`סטטוס חלקים עודכן: ${PARTS_STATUS_LABELS[v]}`);
        setTimeout(() => setPartsStatusMessage(null), 5000);
      }
    } finally {
      setUpdatingParts(false);
    }
  }

  // Track all in-flight completions to avoid stale reload races
  const pendingCompletesRef = useRef(0);
  const reloadVersionRef = useRef(0);

  // Set of step IDs currently being completed (ref = no re-render on change)
  const completingStepIdsRef = useRef<Set<string>>(new Set());
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);

  function markStepInFlight(id: string) {
    completingStepIdsRef.current.add(id);
    setCompletingStepId(id);
  }
  function unmarkStepInFlight(id: string) {
    completingStepIdsRef.current.delete(id);
    setCompletingStepId(completingStepIdsRef.current.size > 0 ? Array.from(completingStepIdsRef.current)[0] : null);
  }
  function isStepInFlight(id: string) {
    return completingStepIdsRef.current.has(id);
  }
  const [stepError, setStepError] = useState<string | null>(null);

  // FIXCAR link popup state
  const [editingLinkStepId, setEditingLinkStepId] = useState<string | null>(null);
  const [stepLinks, setStepLinks] = useState<Record<string, string>>({});

  // Seed fixcar link
  useEffect(() => {
    if (!fixcarLink) return;
    const step = steps.find((s) => s.step_key === 'FIXCAR_PHOTOS');
    if (!step) return;
    setStepLinks((prev) => ({ ...prev, [step.id]: fixcarLink }));
  }, [fixcarLink, steps]);

  // WHEELS CHECK file/link panel state
  const [wheelsCheckPanelStepId, setWheelsCheckPanelStepId] = useState<string | null>(null);
  const [wheelsMode, setWheelsMode] = useState<'link' | 'file'>('link');
  const [wheelsLinkValue, setWheelsLinkValue] = useState(wheelsCheckLink ?? '');
  const [wheelsFile, setWheelsFile] = useState<File | null>(null);
  const [wheelsUploading, setWheelsUploading] = useState(false);

  // PREP_ESTIMATE file upload panel state
  const [estimatePanelStepId, setEstimatePanelStepId] = useState<string | null>(null);
  // Holds the file only once it's actually been uploaded (not just picked) —
  // see uploadEstimateFileNow.
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  const [estimateUploading, setEstimateUploading] = useState(false);
  const [estimateUploadError, setEstimateUploadError] = useState<string | null>(null);

  // QUALITY_CONTROL: select bodywork advisor popup
  const [qcPopupStepId, setQcPopupStepId] = useState<string | null>(null);
  const [qcSelectedAdvisor, setQcSelectedAdvisor] = useState('');

  // ── Session 6 — by-whom popup for ISSUE_CATALOG_NUMBERS / PARTS_DISCOUNTS / SEND_COMPLETION_PHOTOS ──
  const [assigneePopupStepId, setAssigneePopupStepId] = useState<string | null>(null);
  const [assigneeInput, setAssigneeInput] = useState('');
  const [catalogNumbersAssignee, setCatalogNumbersAssignee] = useState(initialCatalogNumbersAssignee ?? '');
  const [partsDiscountsAssignee, setPartsDiscountsAssignee] = useState(initialPartsDiscountsAssignee ?? '');
  const [completionPhotosAssignee, setCompletionPhotosAssignee] = useState(initialCompletionPhotosAssignee ?? '');

  // ── Session 6 — ENTER_WORK sub-checklist ──
  // JSONB can come back as {} from older rows — coerce to array defensively.
  const [enterWorkChecklist, setEnterWorkChecklist] = useState<string[]>(
    Array.isArray(initialEnterWorkChecklistState) ? initialEnterWorkChecklistState : []
  );
  const [enterWorkSaveError, setEnterWorkSaveError] = useState<string | null>(null);

  // ── Session 6 — final estimate (READY_FOR_OFFICE) optional upload ──
  const [finalEstimatePanelStepId, setFinalEstimatePanelStepId] = useState<string | null>(null);
  const [finalEstimateFile, setFinalEstimateFile] = useState<File | null>(null);
  const [finalEstimateUploading, setFinalEstimateUploading] = useState(false);

  // ── Session 6 — local mirror of the wheels-check link so the saved value displays without a full reload ──
  const [wheelsCheckLinkValue, setWheelsCheckLinkValue] = useState(wheelsCheckLink ?? '');

  // Top-of-step error banner (more visible than inline setStepError) for upload failures.
  const [uploadErrorBanner, setUploadErrorBanner] = useState<string | null>(null);
  function showUploadError(msg: string) {
    setUploadErrorBanner(msg);
    setTimeout(() => setUploadErrorBanner(null), 8000);
  }

  const [returning, setReturning] = useState(false);

  async function reloadStepsFromDB() {
    // Versioned reload — ignore result if a newer reload has started
    const myVersion = ++reloadVersionRef.current;
    const supabase = createClient();
    const { data: runs } = await supabase
      .from('case_workflow_runs')
      .select('id')
      .eq('case_id', caseId)
      .eq('workflow_type', 'PROFESSIONAL');
    const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
    if (!runIds.length) return;
    const { data } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, state, order_index, completed_at, completed_by, activated_at')
      .in('run_id', runIds)
      .order('order_index');
    // Only apply if this is still the latest reload
    if (data && myVersion === reloadVersionRef.current) {
      onStepsChange(data as StepRow[]);
    }
  }

  async function performComplete(step: StepRow, link?: string) {
    if (isStepInFlight(step.id)) return; // prevent double-click on same step

    // Optimistic update: mark step as DONE immediately
    const now = new Date().toISOString();
    onStepsChange((prev) =>
      prev.map((s) =>
        s.id === step.id ? { ...s, state: 'DONE' as const, completed_at: now, completed_by: null } : s
      )
    );
    markStepInFlight(step.id);
    pendingCompletesRef.current++;
    setStepError(null);

    try {
      const res = await completeActiveStep(caseId, step.id);
      if (res?.error) {
        // Revert optimistic update on error
        onStepsChange((prev) =>
          prev.map((s) =>
            s.id === step.id ? { ...s, state: 'ACTIVE' as const, completed_at: null } : s
          )
        );
        setStepError(res.error);
      } else {
        // Save FIXCAR link if provided
        if (step.step_key === 'FIXCAR_PHOTOS' && link) {
          const linkRes = await updateCaseDetails(caseId, { fixcar_link: link });
          if (linkRes?.error) console.error('[handleComplete] fixcar_link save failed', linkRes.error);
          setFixcarValue(link);
        }
      }
    } catch (e) {
      console.error('[WorkflowStepsSection] complete failed:', e);
      // Revert optimistic update on exception
      onStepsChange((prev) =>
        prev.map((s) =>
          s.id === step.id ? { ...s, state: 'ACTIVE' as const, completed_at: null } : s
        )
      );
      setStepError('שגיאה בהשלמת השלב');
    } finally {
      unmarkStepInFlight(step.id);
      pendingCompletesRef.current--;
      // Only reload from DB once ALL pending completions are done — prevents stale reload races
      if (pendingCompletesRef.current === 0) {
        await reloadStepsFromDB();
      }
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

    if (step.step_key === 'PREP_ESTIMATE') {
      setEstimatePanelStepId(step.id);
      return;
    }

    if (step.step_key === 'QUALITY_CONTROL' && bodyworkAdvisors.length > 0) {
      setQcSelectedAdvisor(qcAssignee || '');
      setQcPopupStepId(step.id);
      return;
    }

    // Session 6 — open "by whom?" popup for catalog/discounts/completion-photos steps.
    if (ASSIGNEE_FIELD_BY_STEP[step.step_key]) {
      setAssigneePopupStepId(step.id);
      // Pre-fill any prior value (and clear stale input from a previous popup).
      const prefilled =
        step.step_key === 'ISSUE_CATALOG_NUMBERS' ? (catalogNumbersAssignee || '') :
        step.step_key === 'PARTS_DISCOUNTS' ? (partsDiscountsAssignee || '') :
        step.step_key === 'SEND_COMPLETION_PHOTOS' ? (completionPhotosAssignee || '') :
        '';
      setAssigneeInput(prefilled);
      return;
    }

    if (step.step_key === 'READY_FOR_OFFICE') {
      if (extras.some((e) => e.status === 'IN_TREATMENT')) {
        setStepError('לא ניתן להשלים - יש תוספות פחחות בטיפול');
        return;
      }
      // Take the LATEST approval per type to avoid being blocked by a stale duplicate row.
      const byType = new Map<string, { status: string }>();
      for (const a of effectiveApprovals) {
        // assume effectiveApprovals is roughly ordered; if not, the server-side check is authoritative.
        if (!byType.has(a.approval_type)) byType.set(a.approval_type, a);
      }
      const estimate = byType.get('ESTIMATE_AND_DETAILS');
      const wheels = byType.get('WHEELS_CHECK');
      if (!estimate || estimate.status !== 'APPROVED') {
        setStepError('לא ניתן להשלים - נדרש אישור CEO לאומדן');
        return;
      }
      if (wheels && wheels.status !== 'APPROVED') {
        setStepError('לא ניתן להשלים - נדרש אישור CEO לטפסי גלגלים');
        return;
      }
    }

    await performComplete(step);
  }

  async function handleSaveLinkAndComplete(step: StepRow) {
    const raw = (stepLinks[step.id] ?? '').trim();
    if (!raw) { setStepError('נדרש קישור'); return; }
    const link = normalizeUrl(raw);
    setStepError(null);
    setEditingLinkStepId(null);
    // Save fixcar link first
    if (step.step_key === 'FIXCAR_PHOTOS') {
      const linkRes = await updateCaseDetails(caseId, { fixcar_link: link });
      if (linkRes?.error) console.error('[handleSaveLinkAndComplete] fixcar_link save failed', linkRes.error);
      setFixcarValue(link);
      setStepLinks((prev) => ({ ...prev, [step.id]: link }));
    }
    await performComplete(step, link);
  }

  async function handleWheelsConfirm(step: StepRow) {
    setStepError(null);
    setWheelsUploading(true);
    try {
      const supabase = createClient();

      if (wheelsMode === 'link') {
        const raw = wheelsLinkValue.trim();
        if (!raw) { setStepError('נדרש קישור'); setWheelsUploading(false); return; }
        const link = normalizeUrl(raw);
        const linkRes = await updateCaseDetails(caseId, { wheels_check_link: link });
        if (linkRes?.error) {
          showUploadError(`שמירת הקישור נכשלה: ${linkRes.error}`);
          setWheelsUploading(false);
          return;
        }
        setWheelsCheckLinkValue(link);
        setWheelsLinkValue(link);
      } else {
        if (!wheelsFile) { setStepError('נדרש קובץ'); setWheelsUploading(false); return; }
        const formData = new FormData();
        formData.append('case_id', caseId);
        formData.append('file', wheelsFile);
        formData.append('document_type', 'WHEELS_CHECK');
        const uploadRes = await uploadCaseDocument(formData);
        if (uploadRes?.error) {
          showUploadError(uploadRes.error);
          setStepError(uploadRes.error);
          setWheelsUploading(false);
          return;
        }
        // Refresh documents list
        const { data: docsData } = await supabase
          .from('case_documents')
          .select('id, file_name, file_path, file_size, mime_type, document_type, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });
        if (docsData) onDocumentsChange(docsData as CaseDocument[]);
      }

      setWheelsCheckPanelStepId(null);
      setWheelsFile(null);
      await performComplete(step);
    } catch (e) {
      console.error('[handleWheelsConfirm] error', e);
      showUploadError(e instanceof Error ? e.message : 'שגיאה לא ידועה בהעלאה');
    } finally {
      setWheelsUploading(false);
    }
  }

  async function handleQcConfirm(step: StepRow) {
    if (!qcSelectedAdvisor) { setStepError('נדרש לבחור יועץ פחח'); return; }
    setStepError(null);
    try {
      const res = await updateCaseDetails(caseId, { qc_assignee: qcSelectedAdvisor });
      if (res?.error) { setStepError('שגיאה בשמירת יועץ בקרת האיכות'); return; }
      setQcPopupStepId(null);
      setQcSelectedAdvisor('');
      await performComplete(step);
    } catch {
      setStepError('שגיאה בשמירת יועץ בקרת האיכות');
    }
  }

  // Uploads immediately on pick/capture/paste, instead of waiting for the
  // later "אישור והשלמת שלב" click. Why: capturing a photo backgrounds the
  // page for the OS camera app, and mobile browsers (iOS Safari especially,
  // more so as an installed PWA) can reload the page on return under memory
  // pressure — silently wiping the in-memory File the old flow held until
  // confirm. That's the "doesn't save consistently" report: the photo was
  // taken, the state holding it just didn't survive to the confirm click.
  // Uploading the moment the file exists means there's nothing left to lose.
  async function uploadEstimateFileNow(file: File) {
    setEstimateUploadError(null);
    setEstimateUploading(true);
    try {
      const formData = new FormData();
      formData.append('case_id', caseId);
      formData.append('file', file);
      formData.append('document_type', 'ESTIMATE');
      const uploadRes = await uploadCaseDocument(formData);
      if (uploadRes?.error) {
        setEstimateUploadError(uploadRes.error);
        showUploadError(uploadRes.error);
        return;
      }
      setEstimateFile(file);
      const supabase = createClient();
      const { data: docsData } = await supabase
        .from('case_documents')
        .select('id, file_name, file_path, file_size, mime_type, document_type, created_at')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (docsData) onDocumentsChange(docsData as CaseDocument[]);
    } catch (e) {
      console.error('[uploadEstimateFileNow] error', e);
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה בהעלאה';
      setEstimateUploadError(msg);
      showUploadError(msg);
    } finally {
      setEstimateUploading(false);
    }
  }

  async function handleEstimateConfirm(step: StepRow) {
    setStepError(null);
    setEstimatePanelStepId(null);
    setEstimateFile(null);
    setEstimateUploadError(null);
    await performComplete(step);
  }

  // Capture pasted screenshots (Ctrl+V) inside the PREP_ESTIMATE panel.
  function handleEstimatePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItem = items.find((it) => it.type.startsWith('image/'));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    // Rename to a friendlier name with a timestamp
    const ext = file.type.split('/')[1] || 'png';
    const renamed = new File([file], `estimate-paste-${Date.now()}.${ext}`, { type: file.type });
    void uploadEstimateFileNow(renamed);
  }

  // ── Session 6 — by-whom popup confirm ──
  async function handleAssigneeConfirm(step: StepRow) {
    const trimmed = assigneeInput.trim();
    if (!trimmed) { setStepError('נדרש שם'); return; }
    const fieldKey = ASSIGNEE_FIELD_BY_STEP[step.step_key];
    if (!fieldKey) { return; }
    setStepError(null);
    try {
      const res = await updateCaseDetails(caseId, { [fieldKey]: trimmed });
      if (res?.error) {
        // Surface the error AND close the popup so the user can retry / see the message.
        setStepError(`שמירת שם המבצע נכשלה: ${res.error}`);
        setAssigneePopupStepId(null);
        setAssigneeInput('');
        return;
      }
      if (fieldKey === 'catalog_numbers_assignee') setCatalogNumbersAssignee(trimmed);
      else if (fieldKey === 'parts_discounts_assignee') setPartsDiscountsAssignee(trimmed);
      else if (fieldKey === 'completion_photos_assignee') setCompletionPhotosAssignee(trimmed);
      setAssigneePopupStepId(null);
      setAssigneeInput('');
      await performComplete(step);
    } catch (e) {
      console.error('[handleAssigneeConfirm] error', e);
      setStepError(e instanceof Error ? `שגיאה: ${e.message}` : 'שגיאה בשמירת שם המבצע');
      setAssigneePopupStepId(null);
      setAssigneeInput('');
    }
  }

  // ── Session 6 — toggle ENTER_WORK sub-checklist item ──
  // Optimistic, with revert + visible error on failure — checked explicitly
  // rather than assumed, so an RLS/schema problem surfaces here instead of
  // letting the checkbox "unstick" on next reload without explanation.
  async function toggleEnterWorkItem(item: string) {
    const prev = enterWorkChecklist;
    const next = enterWorkChecklist.includes(item)
      ? enterWorkChecklist.filter((x) => x !== item)
      : [...enterWorkChecklist, item];
    setEnterWorkChecklist(next);
    setEnterWorkSaveError(null);
    try {
      const res = await updateCaseDetails(caseId, { enter_work_checklist_state: next });
      if (res?.error) {
        setEnterWorkChecklist(prev);
        setEnterWorkSaveError(res.error);
        console.error('[toggleEnterWorkItem] update failed', res.error);
      }
    } catch (e) {
      setEnterWorkChecklist(prev);
      setEnterWorkSaveError(e instanceof Error ? e.message : 'שגיאה בשמירה');
      console.error('[toggleEnterWorkItem] exception', e);
    }
  }

  // ── Session 6 — final estimate upload at READY_FOR_OFFICE (optional, doesn't block) ──
  async function handleFinalEstimateUpload(step: StepRow) {
    if (!finalEstimateFile) { setStepError('נדרש קובץ'); return; }
    setStepError(null);
    setFinalEstimateUploading(true);
    try {
      const formData = new FormData();
      formData.append('case_id', caseId);
      formData.append('file', finalEstimateFile);
      formData.append('document_type', 'FINAL_ESTIMATE');
      const uploadRes = await uploadCaseDocument(formData);
      if (uploadRes?.error) {
        showUploadError(uploadRes.error);
        setStepError(uploadRes.error);
        return;
      }
      // Refresh documents list
      const supabase = createClient();
      const { data: docsData } = await supabase
        .from('case_documents')
        .select('id, file_name, file_path, file_size, mime_type, document_type, created_at')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (docsData) onDocumentsChange(docsData as CaseDocument[]);
      setFinalEstimateFile(null);
      setFinalEstimatePanelStepId(null);
      // Do not auto-complete the step — user still clicks סמן בוצע.
      // Note: deliberately not awaiting performComplete here.
      void step;
    } catch (e) {
      console.error('[handleFinalEstimateUpload] error', e);
      showUploadError(e instanceof Error ? e.message : 'שגיאה לא ידועה בהעלאה');
    } finally {
      setFinalEstimateUploading(false);
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

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
        <span className="text-2xl">✅</span>
        צ&apos;קליסט עבודה
      </h2>

      {uploadErrorBanner && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
          <span className="text-red-600 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">העלאת הקובץ נכשלה</p>
            <p className="text-xs text-red-700 mt-1 break-words">{uploadErrorBanner}</p>
          </div>
          <button type="button" onClick={() => setUploadErrorBanner(null)} className="text-red-600 hover:text-red-800 text-sm">✕</button>
        </div>
      )}
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
            const label = stepLabels[s.step_key] ?? s.step_key ?? `שלב ${index + 1}`;
            const savedLink = stepLinks[s.id] || (s.step_key === 'FIXCAR_PHOTOS' ? fixcarValue : '');
            const hasLink = savedLink.trim().length > 0;
            const hasWheelsLink = s.step_key === 'WHEELS_CHECK' && wheelsCheckLinkValue;

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
                // Take the LATEST approval per type (Bug C — duplicate rows could falsely block).
                const byType = new Map<string, { status: string }>();
                for (const a of effectiveApprovals) {
                  if (!byType.has(a.approval_type)) byType.set(a.approval_type, a);
                }
                const estimate = byType.get('ESTIMATE_AND_DETAILS');
                const wheels = byType.get('WHEELS_CHECK');
                const estimateOk = estimate && estimate.status === 'APPROVED';
                const wheelsOk = !wheels || wheels.status === 'APPROVED';
                if (hasExtrasInTreatment || !estimateOk || !wheelsOk) {
                  isBlocked = true;
                  blockReason = hasExtrasInTreatment ? 'תוספות בטיפול' : 'נדרש אישור CEO';
                }
              }
            }

            // Requested: WHEELS_CHECK gets a time-based urgency color while
            // it's the active step — green under 2h, yellow 2-4h, red past
            // 4h since it became active, so a stalled wheels-form sitting
            // untouched is visible without opening the step.
            let wheelsAgeTier: 'green' | 'yellow' | 'red' | null = null;
            if (s.step_key === 'WHEELS_CHECK' && isActive && s.activated_at) {
              const hoursSinceActive = (Date.now() - new Date(s.activated_at).getTime()) / 3_600_000;
              wheelsAgeTier = hoursSinceActive >= 4 ? 'red' : hoursSinceActive >= 2 ? 'yellow' : 'green';
            }
            const WHEELS_AGE_RING: Record<'green' | 'yellow' | 'red', string> = {
              green: 'ring-2 ring-status-done/50',
              yellow: 'ring-2 ring-status-waiting/60',
              red: 'ring-2 ring-status-rejected/60',
            };
            const WHEELS_AGE_DOT: Record<'green' | 'yellow' | 'red', string> = {
              green: 'bg-status-done',
              yellow: 'bg-status-waiting',
              red: 'bg-status-rejected',
            };

            const isWheelsPanel = wheelsCheckPanelStepId === s.id;
            const isLinkPanel = editingLinkStepId === s.id;

            const isHighlighted = s.step_key === highlightStepKey;

            return (
              <li key={s.id} id={`step-${s.step_key}`} className={`space-y-2 ${isHighlighted ? 'ring-2 ring-brand-red ring-offset-2 rounded-lg' : ''}`}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-shadow ${
                    isActive
                      ? isBlocked
                        ? 'bg-orange-50 border-orange-300'
                        : 'bg-white border-accent shadow-md'
                      : isDone
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-100'
                  } ${wheelsAgeTier ? WHEELS_AGE_RING[wheelsAgeTier] : ''}`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      isDone
                        ? 'bg-green-500 text-white'
                        : isSkipped
                          ? 'bg-gray-300 text-gray-500'
                          : isActive
                            ? isBlocked
                              ? 'bg-orange-500 text-white'
                              : 'bg-blue-600 text-white shadow-sm'
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
                              ? 'text-orange-800'
                              : isActive
                                ? 'text-stone-900 font-semibold'
                                : 'text-gray-700'
                      }`}
                    >
                      {label}
                    </span>
                    {isSkipped && <span className="mr-2 text-xs text-gray-400">(דולג)</span>}
                    {isBlocked && blockReason && (
                      <span className="mr-2 text-xs text-orange-700 font-normal">({blockReason})</span>
                    )}
                    {wheelsAgeTier && (
                      <span className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-stone-500">
                        <span className={`w-2 h-2 rounded-full ${WHEELS_AGE_DOT[wheelsAgeTier]}`} />
                        {Math.floor((Date.now() - new Date(s.activated_at!).getTime()) / 3_600_000)} שעות ממתין
                      </span>
                    )}
                    {/* Requested: once ENTER_WORK is marked done, show a running
                        day-counter here ("X ימים מכניסת הרכב לעבודה") so it's
                        visible on the checklist itself, not just on the
                        painter's own screen (which already had this via
                        enterWorkCompletedAt in painters/[id]/page.tsx). */}
                    {s.step_key === 'ENTER_WORK' && isDone && s.completed_at && (
                      <span className="mr-2 text-xs font-medium text-stone-500">
                        {Math.floor((Date.now() - new Date(s.completed_at).getTime()) / 86_400_000)} ימים מכניסת הרכב לעבודה
                      </span>
                    )}
                  </div>

                  {canEdit && !isDone && !isSkipped && (
                    <button
                      type="button"
                      disabled={isStepInFlight(s.id) || (isBlocked && !STEPS_REQUIRING_LINK.has(s.step_key) && !STEPS_REQUIRING_FILE_OR_LINK.has(s.step_key))}
                      onClick={() => void handleComplete(s)}
                      className={`rounded-md font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                        isBlocked
                          ? 'px-3 py-1.5 text-xs bg-orange-500 text-white hover:bg-orange-600'
                          : isActive
                            ? 'px-5 py-2.5 text-sm bg-accent text-accent-on hover:bg-accent-strong shadow-sm'
                            : 'px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700'
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
                    <div className="border-t border-blue-200 pt-2 mt-2">
                      <p className="text-xs font-semibold text-blue-700 mb-1">צ&apos;קליסט גלגלים</p>
                      {ENTER_WORK_CHECKLIST_ITEMS.map((item) => (
                        <label key={item} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enterWorkChecklist.includes(item)}
                            onChange={() => void toggleEnterWorkItem(item)}
                            className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                          />
                          {item}
                        </label>
                      ))}
                      {enterWorkSaveError && (
                        <p className="mt-2 text-xs text-red-600">⚠️ שמירה נכשלה: {enterWorkSaveError}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Session 6 — display "by whom" for catalog/discounts/completion-photos after step is done */}
                {isDone && (
                  (s.step_key === 'ISSUE_CATALOG_NUMBERS' && catalogNumbersAssignee) ||
                  (s.step_key === 'PARTS_DISCOUNTS' && partsDiscountsAssignee) ||
                  (s.step_key === 'SEND_COMPLETION_PHOTOS' && completionPhotosAssignee)
                ) && (
                  <div className="mr-11 px-3 py-1.5 text-xs text-gray-600">
                    בוצע על ידי: <span className="font-semibold text-gray-800">
                      {s.step_key === 'ISSUE_CATALOG_NUMBERS' ? catalogNumbersAssignee :
                       s.step_key === 'PARTS_DISCOUNTS' ? partsDiscountsAssignee :
                       completionPhotosAssignee}
                    </span>
                  </div>
                )}

                {/* Session 6 — by-whom popup */}
                {canEdit && assigneePopupStepId === s.id && ASSIGNEE_FIELD_BY_STEP[s.step_key] && !isDone && !isSkipped && (
                  <div className="mr-11 mt-1 p-4 bg-white rounded-lg border border-cyan-300 shadow-md">
                    <p className="text-xs font-semibold text-cyan-700 mb-2">👤 על ידי מי בוצע השלב?</p>
                    <input
                      autoFocus
                      type="text"
                      value={assigneeInput}
                      onChange={(e) => setAssigneeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleAssigneeConfirm(s);
                        if (e.key === 'Escape') { setAssigneePopupStepId(null); setAssigneeInput(''); }
                      }}
                      placeholder="הקלד שם..."
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 mb-3"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!assigneeInput.trim()}
                        onClick={() => void handleAssigneeConfirm(s)}
                        className="px-4 py-1.5 bg-cyan-600 text-white rounded-md text-xs font-semibold hover:bg-cyan-700 disabled:opacity-50"
                      >
                        ✓ אישור והשלמת שלב
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAssigneePopupStepId(null); setAssigneeInput(''); }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-200"
                      >
                        ✕ ביטול
                      </button>
                    </div>
                  </div>
                )}

                {/* Session 6 — final estimate upload panel for READY_FOR_OFFICE */}
                {canEdit && isActive && s.step_key === 'READY_FOR_OFFICE' && (
                  <div className="mr-11 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    {finalEstimatePanelStepId === s.id ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-purple-700">📄 העלה אומדן סופי (אופציונלי)</p>
                        <p className="text-xs text-gray-600">האומדן הסופי כולל הנחות, מק&quot;טים והכל. עמית יראה אותו לפני סגירה.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium cursor-pointer hover:bg-gray-50">
                            📁 בחר קובץ
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => setFinalEstimateFile(e.target.files?.[0] ?? null)}
                              className="hidden"
                            />
                          </label>
                          <label className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-purple-100 border border-purple-300 text-purple-700 rounded-md text-xs font-medium cursor-pointer hover:bg-purple-200">
                            📷 צלם
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => setFinalEstimateFile(e.target.files?.[0] ?? null)}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {finalEstimateFile && (
                          <p className="text-xs text-green-700">✓ {finalEstimateFile.name} ({(finalEstimateFile.size / 1024).toFixed(0)} KB)</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!finalEstimateFile || finalEstimateUploading}
                            onClick={() => void handleFinalEstimateUpload(s)}
                            className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-semibold hover:bg-purple-700 disabled:opacity-50"
                          >
                            {finalEstimateUploading ? '⏳ מעלה...' : '✓ העלה'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFinalEstimatePanelStepId(null); setFinalEstimateFile(null); }}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-200"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFinalEstimatePanelStepId(s.id)}
                        className="text-xs text-purple-700 underline"
                      >
                        📄 העלה אומדן סופי לבדיקת CEO (אופציונלי)
                      </button>
                    )}
                  </div>
                )}


                {/* WAIT_APPRAISER_APPROVAL — sub-status */}
                {s.step_key === 'WAIT_APPRAISER_APPROVAL' && (isActive || isDone) && canEdit && (
                  <div className="mr-11 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-semibold text-blue-700 mb-2">סטטוס אישור שמאי</p>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 'APPROVED', label: 'מאושר', color: 'bg-green-100 border-green-400 text-green-800' },
                        { value: 'NOT_APPROVED', label: 'לא מאושר', color: 'bg-red-100 border-red-400 text-red-800' },
                        { value: 'WAITING_SETTLEMENT', label: 'ממתין להסדר', color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => void saveAppraiserStatus(appraiserStatus === opt.value ? '' : opt.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            appraiserStatus === opt.value
                              ? opt.color + ' ring-2 ring-offset-1 ring-current'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* QUALITY_CONTROL — assignee (inline, free text with suggestions) */}
                {s.step_key === 'QUALITY_CONTROL' && canEdit && (
                  <div className="mr-11 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs font-semibold text-gray-600 mb-2">מבצע בקרת איכות</p>
                    <input
                      list={`qc-inline-advisors-${s.id}`}
                      value={qcAssignee}
                      onChange={(e) => setQcAssignee(e.target.value)}
                      onBlur={(e) => void saveQcAssignee(e.target.value)}
                      placeholder="הקלד שם..."
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-brand-red outline-none w-48"
                    />
                    <datalist id={`qc-inline-advisors-${s.id}`}>
                      {bodyworkAdvisors.map((adv) => (
                        <option key={adv.id} value={adv.full_name} />
                      ))}
                    </datalist>
                    {qcAssignee && (
                      <span className="mr-3 text-sm text-gray-600">✓ {qcAssignee}</span>
                    )}
                  </div>
                )}

                {/* FIXCAR link display */}
                {isDone && hasLink && s.step_key === 'FIXCAR_PHOTOS' && (
                  <div className="mr-11 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs font-medium text-gray-600 mb-1">קישור FixCar:</p>
                    <a
                      href={normalizeUrl(savedLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700 underline break-all block"
                      dir="ltr"
                    >
                      {savedLink}
                    </a>
                  </div>
                )}

                {/* WHEELS CHECK link/file display after done */}
                {isDone && hasWheelsLink && s.step_key === 'WHEELS_CHECK' && (
                  <div className="mr-11 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs font-medium text-gray-600 mb-1">קישור טפסי גלגלים:</p>
                    <a
                      href={normalizeUrl(wheelsCheckLinkValue)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700 underline break-all block"
                      dir="ltr"
                    >
                      {wheelsCheckLinkValue}
                    </a>
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
                        disabled={isStepInFlight(s.id)}
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

                {/* PREP_ESTIMATE file upload panel */}
                {canEdit && estimatePanelStepId === s.id && s.step_key === 'PREP_ESTIMATE' && !isDone && !isSkipped && (
                  <div
                    className="mr-11 mt-1 p-4 bg-white rounded-lg border border-orange-300 shadow-md"
                    tabIndex={0}
                    onPaste={handleEstimatePaste}
                  >
                    <p className="text-xs font-semibold text-orange-700 mb-1">📄 העלה קובץ אומדן (אופציונלי)</p>
                    <p className="text-xs text-gray-500 mb-2">ניתן להמשיך גם ללא קובץ. הדבק תמונה (Ctrl+V) או בחר קובץ — עולה מיד ↓</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <label className={`flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium hover:bg-gray-50 ${estimateUploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
                        📁 בחר קובץ
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={estimateUploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEstimateFileNow(f); e.target.value = ''; }}
                          className="hidden"
                        />
                      </label>
                      <label className={`flex items-center justify-center gap-1.5 px-2 py-1.5 bg-orange-100 border border-orange-300 text-orange-700 rounded-md text-xs font-medium hover:bg-orange-200 ${estimateUploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
                        📷 צלם
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={estimateUploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEstimateFileNow(f); e.target.value = ''; }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {estimateUploading && <p className="text-xs text-gray-500 mb-3">⏳ מעלה...</p>}
                    {estimateFile && !estimateUploading && (
                      <p className="text-xs text-green-700 mb-3">
                        ✓ הועלה: <span className="font-semibold">{estimateFile.name}</span> ({(estimateFile.size / 1024).toFixed(0)} KB)
                      </p>
                    )}
                    {estimateUploadError && <p className="text-xs text-red-600 mb-3">⚠️ {estimateUploadError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={estimateUploading}
                        onClick={() => void handleEstimateConfirm(s)}
                        className="px-4 py-1.5 bg-orange-600 text-white rounded-md text-xs font-semibold hover:bg-orange-700 disabled:opacity-50"
                      >
                        {estimateUploading ? '⏳ מעלה...' : '✓ אישור והשלמת שלב'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEstimatePanelStepId(null); setEstimateFile(null); setEstimateUploadError(null); }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-200"
                      >
                        ✕ ביטול
                      </button>
                    </div>
                  </div>
                )}

                {/* QUALITY CONTROL: bodywork advisor selection popup (text + datalist suggestions) */}
                {canEdit && qcPopupStepId === s.id && s.step_key === 'QUALITY_CONTROL' && !isDone && !isSkipped && (
                  <div className="mr-11 mt-1 p-4 bg-white rounded-lg border border-indigo-300 shadow-md">
                    <p className="text-xs font-semibold text-indigo-700 mb-3">👤 מי ביצע את בקרת האיכות?</p>
                    <input
                      autoFocus
                      list={`qc-advisors-${s.id}`}
                      value={qcSelectedAdvisor}
                      onChange={(e) => setQcSelectedAdvisor(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && qcSelectedAdvisor.trim()) void handleQcConfirm(s);
                        if (e.key === 'Escape') { setQcPopupStepId(null); setQcSelectedAdvisor(''); }
                      }}
                      placeholder="הקלד שם או בחר מהרשימה..."
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
                    />
                    <datalist id={`qc-advisors-${s.id}`}>
                      {bodyworkAdvisors.map((adv) => (
                        <option key={adv.id} value={adv.full_name} />
                      ))}
                    </datalist>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!qcSelectedAdvisor.trim()}
                        onClick={() => void handleQcConfirm(s)}
                        className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                      >
                        ✓ אישור והשלמת שלב
                      </button>
                      <button
                        type="button"
                        onClick={() => { setQcPopupStepId(null); setQcSelectedAdvisor(''); }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-200"
                      >
                        ✕ ביטול
                      </button>
                    </div>
                  </div>
                )}

                {/* WHEELS CHECK file/link panel — stays editable even after DONE */}
                {canEdit && isWheelsPanel && STEPS_REQUIRING_FILE_OR_LINK.has(s.step_key) && !isSkipped && (
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
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium cursor-pointer hover:bg-gray-50">
                            📁 בחר קובץ (PDF/תמונה)
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => setWheelsFile(e.target.files?.[0] ?? null)}
                              className="hidden"
                            />
                          </label>
                          <label className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-purple-100 border border-purple-300 text-purple-700 rounded-md text-xs font-medium cursor-pointer hover:bg-purple-200">
                            📷 צלם
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => setWheelsFile(e.target.files?.[0] ?? null)}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {wheelsFile && (
                          <p className="text-xs text-green-700">✓ {wheelsFile.name} ({(wheelsFile.size / 1024).toFixed(0)} KB)</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        disabled={wheelsUploading || completingStepId === s.id || isDone}
                        onClick={() => void handleWheelsConfirm(s)}
                        className="px-4 py-1.5 bg-purple-600 text-white rounded-md text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDone ? '✓ השלם בוצע' : wheelsUploading ? '⏳ מעלה...' : '✓ אישור והשלמת שלב'}
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

      {canEdit && (() => {
        // Hide "return to estimate" once the professional workflow is finished.
        // Treatment is over once there's no ACTIVE professional step left
        // (SEND_COMPLETION_PHOTOS auto-completes READY_FOR_OFFICE and ends the run).
        const PROFESSIONAL_KEYS = new Set([
          'OPEN_CASE','FIXCAR_PHOTOS','WHEELS_CHECK','PREP_ESTIMATE','SEND_TO_APPRAISER',
          'WAIT_APPRAISER_APPROVAL','ENTER_WORK','ISSUE_CATALOG_NUMBERS','PARTS_DISCOUNTS',
          'QUALITY_CONTROL','WASH','SEND_COMPLETION_PHOTOS','READY_FOR_OFFICE',
        ]);
        const hasActiveProfessionalStep = orderedSteps.some(
          (s) => PROFESSIONAL_KEYS.has(s.step_key) && s.state === 'ACTIVE'
        );
        const caseClosed = generalStatus === 'COMPLETED';
        if (!hasActiveProfessionalStep || caseClosed) return null;
        return (
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
        );
      })()}
    </div>
  );
}
