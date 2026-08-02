'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { completeActiveStep } from '@/app/actions/workflow';
import { LicensePlate } from '@/components/ui/LicensePlate';

const STEP_LABELS: Record<string, string> = {
  CLOSURE_VERIFY_DETAILS_DOCS: 'אימות פרטים ומסמכים',
  CLOSURE_PROFORMA_IF_NEEDED: 'פרופורמה במידת הצורך',
  CLOSURE_PREPARE_CLOSING_FORMS: 'הכנת טפסי סגירה',
  CLOSE_CASE: 'סגירת תיק',
};

const STEP_ICONS: Record<string, string> = {
  CLOSURE_VERIFY_DETAILS_DOCS: '📋',
  CLOSURE_PROFORMA_IF_NEEDED: '🧾',
  CLOSURE_PREPARE_CLOSING_FORMS: '📝',
  CLOSE_CASE: '🔒',
};

const SUB_CLAIM_LABELS: Record<string, string> = {
  POLICY: 'פוליסה',
  THIRD_PARTY: "צד ג'",
  THIRD_PARTY_SETTLEMENT: "הסדר ג'",
  PRIVATE_REPAIR: 'תיקון פרטי',
  SHLOMO_POLICY: 'מוקד שלמה פוליסה',
  SHLOMO_THIRD_PARTY: "מוקד שלמה צד ג'",
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  PRIVATE: 'פרטי',
  ACCIDENT: 'תאונה',
  FLOOD: 'הצפה',
};

// Dynamic checklist per sub_claim_type
const CLOSURE_CHECKLIST: Record<string, string[]> = {
  POLICY: [
    'התקבל הסדר',
    'גביית השתתפות עצמית',
    'אישור קיזוז מע"מ',
    'שליחת חשבונית לשמאי',
    'שליחת טפסי גלגלים',
    'טפסי פרונט / כיול ראדר',
  ],
  THIRD_PARTY: [
    'גביית ציק מוסך',
    'גביית ציק שמאי',
    'שליחת חשבונית לשמאי',
    'שליחת טפסי גלגלים',
    'אישור קיזוז מע"מ',
    'טפסי פרונט / כיול ראדר',
    'בדיקת ציקים PCS עם מס׳ אישור',
  ],
  THIRD_PARTY_SETTLEMENT: [
    'חתימה על טפסי הסדר ג׳',
    'שליחת חשבונית לשמאי',
    'שליחת טפסי גלגלים',
    'שליחת טפסי פרונט / כיול ראדר',
    'אישור קיזוז מע"מ',
  ],
  SHLOMO_POLICY: [
    'אישור חשבונית גמר במוקד',
    'גביית השתתפות עצמית',
    'שליחת חשבונית לשמאי של שלמה',
    'חתימה על אישור הסדר',
    'שליחת טפסי גלגלים',
    'שליחת טפסי פרונט / כיול ראדר',
    'התקבל אישור קיזוז מע"מ',
  ],
  SHLOMO_THIRD_PARTY: [
    'אישור חשבונית גמר במוקד',
    'שליחת ציקים לבדיקה במוקד',
    'שליחת חשבונית לשמאי של שלמה',
    'שליחת טפסי גלגלים',
    'שליחת טפסי פרונט / כיול ראדר',
    'התקבל מספר אישור',
  ],
  PRIVATE_REPAIR: [
    'גביית תשלום על תיקון',
  ],
};

type StepState = 'ACTIVE' | 'PENDING' | 'DONE' | 'SKIPPED';
type StepRow = { id: string; step_key: string; state: StepState; order_index: number; completed_at: string | null };

function formatStepCompletedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('he-IL');
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `הושלם ב-${date}, ${time}`;
}

interface ClosureDetailClientProps {
  caseId: string;
  caseKey: string | null;
  customerName: string | null;
  plate: string;
  carMake: string | null;
  carModel: string | null;
  branchName: string;
  openedAt: string | null;
  insuranceType: string | null;
  claimNumber: string | null;
  claimType: string | null;
  subClaimType: string | null;
  insuranceCompany: string | null;
  steps: StepRow[];
  blockedByExtras: boolean;
  blockedByApprovals: boolean;
  canClose: boolean;
  isPreview?: boolean;
  initialChecklistState?: Record<string, boolean>;
}

export function ClosureDetailClient({
  caseId,
  caseKey,
  customerName,
  plate,
  carMake,
  carModel,
  branchName,
  openedAt,
  insuranceType,
  claimNumber,
  claimType,
  subClaimType,
  insuranceCompany,
  steps,
  blockedByExtras,
  blockedByApprovals,
  canClose,
  isPreview = false,
  initialChecklistState = {},
}: ClosureDetailClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localSteps, setLocalSteps] = useState<StepRow[]>(isPreview ? [] : steps);
  const initRef = useRef<string | null>(null);
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);

  // Dynamic checklist state — initialized from DB-persisted state
  const checklistItems = subClaimType ? (CLOSURE_CHECKLIST[subClaimType] ?? []) : [];
  const [checkedItems, setCheckedItems] = useState<boolean[]>(
    () => checklistItems.map((_, i) => initialChecklistState[String(i)] === true)
  );

  // Debounce timer ref for checklist save
  const checklistSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [checklistSaveError, setChecklistSaveError] = useState<string | null>(null);
  const [checklistSavedAt, setChecklistSavedAt] = useState<number | null>(null);

  const saveChecklistState = useCallback(async (state: boolean[]) => {
    const supabase = (await import('@/lib/supabase/client')).createClient();
    const jsonState: Record<string, boolean> = {};
    state.forEach((v, i) => { if (v) jsonState[String(i)] = true; });
    const { error: saveErr } = await supabase
      .from('cases')
      .update({ closure_checklist_state: jsonState } as never)
      .eq('id', caseId);
    if (saveErr) {
      setChecklistSaveError(saveErr.message);
      console.error('[saveChecklistState] failed', saveErr);
    } else {
      setChecklistSaveError(null);
      setChecklistSavedAt(Date.now());
    }
  }, [caseId]);

  function handleChecklistChange(index: number) {
    const next = [...checkedItems];
    next[index] = !next[index];
    setCheckedItems(next);

    // Debounce save
    if (checklistSaveTimer.current) clearTimeout(checklistSaveTimer.current);
    checklistSaveTimer.current = setTimeout(() => {
      void saveChecklistState(next);
    }, 800);
  }

  const isShlomoInsurance = insuranceCompany === 'שלמה רשת מוסכים';

  useEffect(() => {
    if (!isPreview) return;
    if (initRef.current === caseId) return;
    initRef.current = caseId;

    (async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data: runs } = await supabase
        .from('case_workflow_runs')
        .select('id')
        .eq('case_id', caseId)
        .eq('workflow_type', 'CLOSURE');
      const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
      if (runIds.length === 0) return;

      const { data: stepsData } = await supabase
        .from('case_workflow_steps')
        .select('id, step_key, state, order_index, completed_at')
        .in('run_id', runIds)
        .order('order_index');

      if (stepsData && stepsData.length > 0) {
        const raw = (stepsData as StepRow[]).sort((a, b) => a.order_index - b.order_index);
        const normalized = normalizeStepStates(raw);
        setLocalSteps(normalized);
      }
    })().catch(console.error);
  }, [isPreview, caseId]);

  useEffect(() => {
    if (!isPreview) return;
    if (completingStepId !== null) return;

    const reloadSteps = async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data: runs } = await supabase
        .from('case_workflow_runs')
        .select('id')
        .eq('case_id', caseId)
        .eq('workflow_type', 'CLOSURE');
      const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
      if (runIds.length === 0) return;

      const { data: stepsData } = await supabase
        .from('case_workflow_steps')
        .select('id, step_key, state, order_index, completed_at')
        .in('run_id', runIds)
        .order('order_index');

      if (stepsData && stepsData.length > 0) {
        const raw = (stepsData as StepRow[]).sort((a, b) => a.order_index - b.order_index);
        const normalized = normalizeStepStates(raw);
        setLocalSteps(normalized);
      }
    };

    const timer = setTimeout(() => {
      reloadSteps().catch(console.error);
    }, 500);

    return () => clearTimeout(timer);
  }, [isPreview, caseId, completingStepId]);

  function normalizeStepStates(raw: StepRow[]): StepRow[] {
    let foundActive = false;
    return raw.map((s) => {
      if (s.state === 'DONE') return s;
      if (!foundActive) {
        foundActive = true;
        return { ...s, state: 'ACTIVE' };
      }
      return { ...s, state: 'PENDING' };
    });
  }

  const effectiveSteps = localSteps.length > 0 ? localSteps : steps;
  const orderedSteps = [...effectiveSteps].sort((a, b) => a.order_index - b.order_index);
  const normalizedSteps = normalizeStepStates(orderedSteps);
  const activeStep = normalizedSteps.find((s) => s.state === 'ACTIVE');

  // Session 6: CASE_CLOSURE approval requirement removed — closure is no longer gated by a second CEO approval.
  // The variable is kept to satisfy the older prop, but the gate is purely on extras/estimate now.
  const allDone = normalizedSteps.length > 0 && normalizedSteps.every((s) => s.state === 'DONE');
  const isCaseClosed = allDone;
  const closeBlocked = blockedByExtras || blockedByApprovals;
  const doneCount = normalizedSteps.filter((s) => s.state === 'DONE').length;

  const daysOpen = openedAt
    ? Math.floor((Date.now() - new Date(openedAt).getTime()) / 86400000)
    : null;

  async function completePreviewStep(step: StepRow) {
    const supabase = (await import('@/lib/supabase/client')).createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    await supabase
      .from('case_workflow_steps')
      .update({ state: 'DONE', completed_at: now, completed_by: user?.id ?? null } as never)
      .eq('id', step.id);

    const sorted = [...normalizedSteps].sort((a, b) => a.order_index - b.order_index);
    const nextStep = sorted.find((s) => s.order_index > step.order_index && s.state !== 'DONE');
    if (nextStep) {
      await supabase
        .from('case_workflow_steps')
        .update({ state: 'ACTIVE', activated_at: now } as never)
        .eq('id', nextStep.id);
    }

    // Session 6: CASE_CLOSURE approval no longer created — preview mode mirrors production.

    if (step.step_key === 'CLOSE_CASE') {
      await supabase
        .from('cases')
        .update({ closed_at: now, general_status: 'COMPLETED' } as never)
        .eq('id', caseId);
    }

    setLocalSteps(
      sorted.map((s) => {
        if (s.id === step.id) return { ...s, state: 'DONE', completed_at: now };
        if (nextStep && s.id === nextStep.id) return { ...s, state: 'ACTIVE' };
        if (s.order_index > step.order_index && s.id !== nextStep?.id) return { ...s, state: 'PENDING' };
        return s;
      })
    );

    setTimeout(async () => {
      const { data: runs } = await supabase
        .from('case_workflow_runs')
        .select('id')
        .eq('case_id', caseId)
        .eq('workflow_type', 'CLOSURE');
      const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
      if (runIds.length > 0) {
        const { data: updatedSteps } = await supabase
          .from('case_workflow_steps')
          .select('id, step_key, state, order_index, completed_at')
          .in('run_id', runIds)
          .order('order_index');

        if (updatedSteps && updatedSteps.length > 0) {
          const raw = (updatedSteps as StepRow[]).sort((a, b) => a.order_index - b.order_index);
          const normalized = normalizeStepStates(raw);
          setLocalSteps(normalized);
        }
      }
    }, 100);
  }

  // Reload closure steps from DB — used after completing a step so UI updates
  // without requiring the user to refresh / re-enter the page.
  async function reloadClosureSteps() {
    const supabase = (await import('@/lib/supabase/client')).createClient();
    const { data: runs } = await supabase
      .from('case_workflow_runs')
      .select('id')
      .eq('case_id', caseId)
      .eq('workflow_type', 'CLOSURE');
    const runIds = (runs as { id: string }[] | null)?.map((r) => r.id) ?? [];
    if (!runIds.length) return;
    const { data } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, state, order_index, completed_at')
      .in('run_id', runIds)
      .order('order_index');
    if (data) {
      const sorted = (data as StepRow[]).sort((a, b) => a.order_index - b.order_index);
      setLocalSteps(normalizeStepStates(sorted));
    }
  }

  async function handleCompleteStep() {
    if (!activeStep) return;
    setError(null);
    setLoading(true);
    setCompletingStepId(activeStep.id);

    // Optimistic update: mark this step DONE + advance the next PENDING step
    // immediately so the user sees the change without waiting for the round-trip.
    const stepBeingCompleted = activeStep;
    const completedAtOptimistic = new Date().toISOString();
    setLocalSteps((prev) => {
      const sorted = [...prev].sort((a, b) => a.order_index - b.order_index);
      const nextStep = sorted.find(
        (s) => s.order_index > stepBeingCompleted.order_index && s.state !== 'DONE'
      );
      return sorted.map((s) => {
        if (s.id === stepBeingCompleted.id) return { ...s, state: 'DONE', completed_at: completedAtOptimistic };
        if (nextStep && s.id === nextStep.id) return { ...s, state: 'ACTIVE' };
        return s;
      });
    });

    try {
      if (isPreview) {
        await completePreviewStep(stepBeingCompleted);
      } else {
        const res = await completeActiveStep(caseId);
        if (res?.error) {
          setError(res.error);
          // Roll back optimistic update on error
          await reloadClosureSteps();
        } else {
          // Confirm against DB (and pick up server-side side effects like CLOSE_CASE)
          await reloadClosureSteps();
          router.refresh();
        }
      }
    } catch (e) {
      console.error('[ClosureDetailClient] error:', e);
      setError('שגיאה בהשלמת השלב');
      await reloadClosureSteps();
    } finally {
      setLoading(false);
      setCompletingStepId(null);
    }
  }

  // Filter steps: hide PROFORMA if not Shlomo insurance (auto-skip it visually)
  const visibleSteps = normalizedSteps.filter((s) => {
    if (s.step_key === 'CLOSURE_PROFORMA_IF_NEEDED' && !isShlomoInsurance) return false;
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <Link href="/closure" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
        <span>←</span>
        <span>חזרה לסגירה</span>
      </Link>

      {/* Case details card */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            {customerName ? (
              <h2 className="text-2xl font-bold text-gray-900">{customerName}</h2>
            ) : caseKey ? (
              <h2 className="text-2xl font-bold text-gray-900">{caseKey}</h2>
            ) : (
              <LicensePlate plate={plate} size="lg" />
            )}
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              {(customerName || caseKey) && <LicensePlate plate={plate} size="sm" />}
              <span>{carMake ? `${carMake} ${carModel ?? ''} · ` : ''}{branchName}</span>
            </div>
          </div>
          {allDone ? (
            <span className="px-3 py-1.5 bg-green-100 text-green-800 border border-green-200 rounded-full text-sm font-semibold">
              🎉 נסגר בהצלחה
            </span>
          ) : (
            <span className="px-3 py-1.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-sm font-semibold">
              בטיפול משרדי
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {openedAt && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">תאריך פתיחה</p>
              <p className="text-sm font-semibold text-gray-700">
                {new Date(openedAt).toLocaleDateString('he-IL')}
              </p>
            </div>
          )}
          {daysOpen !== null && (
            <div className={`rounded-lg p-3 border ${daysOpen > 14 ? 'bg-red-50 border-red-100' : daysOpen > 7 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className="text-xs text-gray-400 mb-1">גיל תיק</p>
              <p className={`text-sm font-semibold ${daysOpen > 14 ? 'text-red-700' : daysOpen > 7 ? 'text-amber-700' : 'text-gray-700'}`}>
                {daysOpen} ימים
              </p>
            </div>
          )}
          {claimNumber && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">מס׳ תביעה</p>
              <p className="text-sm font-semibold text-gray-700">{claimNumber}</p>
            </div>
          )}
          {insuranceCompany && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">חברת ביטוח</p>
              <p className="text-sm font-semibold text-gray-700">{insuranceCompany}</p>
            </div>
          )}
          {subClaimType && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-gray-400 mb-1">סוג תביעה</p>
              <p className="text-sm font-semibold text-blue-700">{SUB_CLAIM_LABELS[subClaimType] ?? subClaimType}</p>
            </div>
          )}
          {!subClaimType && claimType && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">סוג תביעה</p>
              <p className="text-sm font-semibold text-gray-700">{CLAIM_TYPE_LABELS[claimType] ?? claimType}</p>
            </div>
          )}
        </div>

        {!isCaseClosed && (blockedByExtras || blockedByApprovals) && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
              <span>⚠️</span>
              {blockedByExtras && <span>קיימות תוספות פחחות בטיפול.</span>}
              {blockedByApprovals && <span>חסר אישור CEO לאומדן/גלגלים.</span>}
            </p>
          </div>
        )}
      </div>

      {/* Closure workflow steps */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span>📋</span>
            צ׳קליסט סגירה
          </h2>
          <span className="text-sm text-gray-500 font-medium">
            {doneCount} / {visibleSteps.length} הושלמו
          </span>
        </div>

        {allDone && (
          <div className="mb-5 p-4 bg-green-50 border-2 border-green-200 rounded-xl text-center">
            <div className="text-3xl mb-1">🎉</div>
            <p className="text-green-800 font-semibold">התיק נסגר בהצלחה!</p>
            <p className="text-green-600 text-sm mt-0.5">כל שלבי הסגירה הושלמו</p>
          </div>
        )}

        <ul className="space-y-3">
          {visibleSteps.map((s, idx) => {
            const isDone = s.state === 'DONE';
            const isActive = s.state === 'ACTIVE';
            const icon = STEP_ICONS[s.step_key] ?? '•';
            const label = STEP_LABELS[s.step_key] ?? s.step_key;
            const hasNestedChecklist = s.step_key === 'CLOSURE_VERIFY_DETAILS_DOCS' && checklistItems.length > 0;
            const checkedCount = checkedItems.filter(Boolean).length;

            return (
              <li
                key={s.id}
                className={`p-4 rounded-xl border-2 transition-all ${
                  isDone
                    ? 'bg-green-50 border-green-200'
                    : isActive
                      ? 'bg-blue-50 border-blue-300 shadow-sm'
                      : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                      isDone
                        ? 'bg-green-500 text-white'
                        : isActive
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {isDone ? '✓' : icon}
                  </div>

                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${isDone ? 'text-green-700 line-through' : isActive ? 'text-blue-800' : 'text-gray-500'}`}>
                      {label}
                    </p>
                    {isActive && !isDone && !hasNestedChecklist && (
                      <p className="text-xs text-blue-500 mt-0.5">שלב נוכחי</p>
                    )}
                    {isDone && s.completed_at && (
                      <p className="text-xs text-green-600 mt-0.5">{formatStepCompletedAt(s.completed_at)}</p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {isActive && !isDone && hasNestedChecklist ? (
                      <span className="text-xs font-medium text-blue-600">
                        {checkedCount} / {checklistItems.length}
                      </span>
                    ) : isDone ? (
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-200">
                        הושלם
                      </span>
                    ) : isActive ? (
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                        בתהליך
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">שלב {idx + 1}</span>
                    )}
                  </div>
                </div>

                {/* Insurance paperwork checklist — lives inside this step since it's what completing it actually means */}
                {hasNestedChecklist && isActive && (
                  <div className="mt-3 mr-14 pr-3 border-r-2 border-blue-200 space-y-1.5">
                    {checklistItems.map((item, i) => (
                      <label key={i} className="flex items-center gap-3 cursor-pointer group w-full">
                        <input
                          type="checkbox"
                          checked={checkedItems[i] ?? false}
                          onChange={() => handleChecklistChange(i)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red cursor-pointer flex-shrink-0"
                        />
                        <span className={`text-xs transition-all ${checkedItems[i] ? 'line-through text-gray-400' : 'text-gray-700 group-hover:text-gray-900'}`}>
                          {item}
                        </span>
                      </label>
                    ))}
                    {(checklistSaveError || checklistSavedAt) && (
                      <div className="pt-1 text-xs">
                        {checklistSaveError ? (
                          <span className="text-red-600">⚠️ שמירה נכשלה: {checklistSaveError}</span>
                        ) : (
                          <span className="text-green-600">✓ נשמר</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {canClose && activeStep && !allDone && (
          <div className="mt-5 border-t pt-5">
            {/* Skip proforma automatically if not Shlomo */}
            {activeStep.step_key === 'CLOSURE_PROFORMA_IF_NEEDED' && !isShlomoInsurance ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleCompleteStep}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold shadow-sm bg-gray-400 text-white hover:bg-gray-500 disabled:opacity-50 transition-all"
                >
                  {loading ? '⏳ מבצע...' : 'דלג על פרופורמה (לא רלוונטי)'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={loading || (activeStep.step_key === 'CLOSE_CASE' && closeBlocked)}
                  onClick={handleCompleteStep}
                  className={`px-6 py-2.5 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                    activeStep.step_key === 'CLOSE_CASE'
                      ? closeBlocked
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-md'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
                  }`}
                >
                  {loading
                    ? '⏳ מבצע...'
                    : activeStep.step_key === 'CLOSE_CASE'
                      ? closeBlocked
                        ? '🔒 סגירה חסומה'
                        : '🔒 סגור תיק'
                      : '✓ סמן בוצע'}
                </button>

                {closeBlocked && (
                  <p className="text-sm text-amber-700">
                    {blockedByExtras && 'יש תוספות בטיפול. '}
                    {blockedByApprovals && 'חסר אישור CEO לאומדן/גלגלים.'}
                  </p>
                )}
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 mt-3 flex items-center gap-1">
                <span>⚠️</span> {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
