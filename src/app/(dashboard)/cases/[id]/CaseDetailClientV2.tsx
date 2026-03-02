'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { completeActiveStep, returnToEstimate } from '@/app/actions/workflow';
import { uploadCaseDocument, deleteCaseDocument } from '@/app/actions/documents';
import { createClient } from '@/lib/supabase/client';
import type { PartsStatus } from '@/types/database';
import { PARTS_STATUS_LABELS } from '@/types/database';

const DEFAULT_STEP_LABELS: Record<string, string> = {
  OPEN_CASE: 'פתיחת תיק',
  FIXCAR_PHOTOS: 'צילום FixCar',
  WHEELS_CHECK: 'תפסי גלגלים',
  PREP_ESTIMATE: 'אומדן',
  SUMMARIZE_ESTIMATE: 'סיכום אומדן',
  SEND_TO_APPRAISER: 'שליחה לשמאי',
  WAIT_APPRAISER_APPROVAL: 'המתנה לאישור שמאי',
  ENTER_WORK: 'כניסה לעבודה',
  ISSUE_CATALOG_NUMBERS: 'ניפוק מק"טים',
  PARTS_DISCOUNTS: 'הנחות חלקים',
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
  steps: StepRow[];
  approvals: { id: string; approval_type: string; status: string; rejection_note: string | null }[];
  extras: { id: string; description: string; status: string }[];
  auditEvents: { id: string; action: string; user_id: string | null; created_at: string; payload: unknown }[];
  documents: { id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; created_at: string }[];
  role: string | null;
  userNames: Record<string, string>;
  stepTemplates: StepTemplate[];
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

export function CaseDetailClientV2(props: CaseDetailClientProps) {
  const {
    caseId,
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
    steps,
    approvals,
    extras,
    auditEvents,
    documents,
    role,
    userNames,
    stepTemplates,
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
      } else {
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

  async function performComplete(step: StepRow, link?: string) {
    setCompletingStepId(step.id);
    try {
      const res = await completeActiveStep(caseId, step.id);
      if (res?.error) {
        setStepError(res.error);
      } else {
        // If FIXCAR link provided, save it
        if (step.step_key === 'FIXCAR_PHOTOS' && link) {
          const supabase = (await import('@/lib/supabase/client')).createClient();
          await supabase.from('cases').update({ fixcar_link: link } as never).eq('id', caseId);
          setFixcarValue(link);
        }
        router.refresh();
      }
    } catch (e) {
      console.error('[CaseDetailClientV2] complete failed:', e);
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

  return (
    <div className="space-y-6" dir="rtl">
      <Link href="/cases" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
        <span>←</span>
        <span>חזרה לתיקים</span>
      </Link>

      {/* ── פרטי תיק ── */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
          <span className="text-2xl">📋</span>
          פרטי תיק
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="רישוי" value={plate} />
          <InfoRow label="סניף" value={branchName} />
          <InfoRow label="נפתח" value={openedAt ? new Date(openedAt).toLocaleDateString('he-IL') : '—'} />
          <InfoRow label="גיל רכב" value={age} />
          {customerName && <InfoRow label="שם לקוח" value={customerName} />}
          {phone && <InfoRow label="טלפון" value={phone} />}
          {insuranceCompany && <InfoRow label="חברת ביטוח" value={insuranceCompany} />}
          {appraiserName && <InfoRow label="שמאי" value={appraiserName} />}
          {eventDate && <InfoRow label="תאריך אירוע" value={new Date(eventDate).toLocaleDateString('he-IL')} />}
          {insuranceType && <InfoRow label="סוג ביטוח" value={INSURANCE_TYPE_LABELS[insuranceType] ?? insuranceType} />}
          {claimType && <InfoRow label="סוג תביעה" value={CLAIM_TYPE_LABELS[claimType] ?? claimType} />}
          {subClaimType && <InfoRow label="תת סוג תביעה" value={SUB_CLAIM_LABELS[subClaimType] ?? subClaimType} />}
        </div>

        {canEdit && (
          <div className="mt-4">
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
                if (s.step_key === 'ENTER_WORK' && partsStatus !== 'AVAILABLE') {
                  showWarning = true;
                  warningMessage = `חלקים לא זמינים — סטטוס נוכחי: ${PARTS_STATUS_LABELS[partsStatus] ?? partsStatus}`;
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
                        disabled={!!completingStepId || (isBlocked && !STEPS_REQUIRING_LINK.has(s.step_key) && !STEPS_REQUIRING_FILE_OR_LINK.has(s.step_key))}
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
                        <span className="text-xs font-medium text-gray-600">קישור תפסי גלגלים:</span>
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
                          disabled={!!completingStepId}
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
                      <p className="text-xs font-semibold text-purple-700 mb-3">📎 הוסף לינק או קובץ לתפסי גלגלים</p>
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
                          disabled={wheelsUploading || !!completingStepId}
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
    <>
      <span className="text-gray-500 font-medium">{label}:</span>
      <span className="text-gray-800">{value}</span>
    </>
  );
}
