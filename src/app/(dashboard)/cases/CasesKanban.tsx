'use client';

import { useRouter } from 'next/navigation';
import type { PartsStatus } from '@/types/database';
import { BlockersBadges } from '@/components/ui/BlockersBadges';

export interface KanbanCase {
  id: string;
  plate: string;
  claim: string;
  case_key: string | null;
  customer_name: string | null;
  opened_at: string | null;
  parts_status: PartsStatus;
  nextStep: string | null;
  activeStepKey: string | null;
  notes: string | null;
  hasExtrasInTreatment: boolean;
  approvalBlocked: boolean;
}

const PRE_WORK_STEPS = new Set([
  'OPEN_CASE',
  'FIXCAR_PHOTOS',
  'WHEELS_CHECK',
  'PREP_ESTIMATE',
  'SUMMARIZE_ESTIMATE',
  'SEND_TO_APPRAISER',
  'WAIT_APPRAISER_APPROVAL',
]);

const WORK_STEPS = new Set([
  'ENTER_WORK',
  'ISSUE_CATALOG_NUMBERS',
  'PARTS_DISCOUNTS',
  'QUALITY_CONTROL',
  'WASH',
  'SEND_COMPLETION_PHOTOS',
]);

type Phase = 'preWork' | 'inWork' | 'readyForOffice' | 'noStep';

function getPhase(c: KanbanCase): Phase {
  if (!c.activeStepKey) return 'noStep';
  if (c.activeStepKey === 'READY_FOR_OFFICE') return 'readyForOffice';
  if (WORK_STEPS.has(c.activeStepKey)) return 'inWork';
  if (PRE_WORK_STEPS.has(c.activeStepKey)) return 'preWork';
  return 'noStep';
}

const PHASES: { key: Phase; label: string; color: string; headerColor: string }[] = [
  { key: 'preWork',        label: 'אומדן / שמאי',  color: 'border-blue-200 bg-blue-50/40',   headerColor: 'bg-blue-100 text-blue-800' },
  { key: 'inWork',         label: 'בעבודה',         color: 'border-amber-200 bg-amber-50/40', headerColor: 'bg-amber-100 text-amber-800' },
  { key: 'readyForOffice', label: 'מוכן למשרד',    color: 'border-green-200 bg-green-50/40', headerColor: 'bg-green-100 text-green-800' },
  { key: 'noStep',         label: 'ללא שלב',        color: 'border-gray-200 bg-gray-50/40',   headerColor: 'bg-gray-100 text-gray-600' },
];

function KanbanCard({ c, onClick }: { c: KanbanCase; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-brand-red/30 transition-all space-y-2"
    >
      {/* Plate + notes badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-gray-900 text-sm" dir="ltr">{c.plate}</span>
        {c.notes && (
          <span
            title={c.notes}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-red text-white text-[9px] font-bold shrink-0"
          >
            !
          </span>
        )}
      </div>

      {/* Customer name */}
      {c.customer_name && (
        <p className="text-sm font-semibold text-gray-700 truncate" title={c.customer_name}>
          {c.customer_name}
        </p>
      )}

      {/* Claim number / case key */}
      {(c.claim !== '—' || c.case_key) && (
        <p className="text-xs text-gray-500">
          {c.case_key ? `#${c.case_key}` : ''}{c.case_key && c.claim !== '—' ? ' · ' : ''}{c.claim !== '—' ? c.claim : ''}
        </p>
      )}

      {/* Current step */}
      {c.nextStep && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-brand-red rounded text-[11px] font-semibold ring-1 ring-red-100">
          <span className="w-1 h-1 rounded-full bg-brand-red shrink-0" />
          {c.nextStep}
        </span>
      )}

      {/* Blockers */}
      <BlockersBadges
        partsStatus={c.parts_status}
        hasExtrasInTreatment={c.hasExtrasInTreatment}
        approvalBlocked={c.approvalBlocked}
      />
    </div>
  );
}

export function CasesKanban({ cases, role }: { cases: KanbanCase[]; role: string | null }) {
  const router = useRouter();
  void role; // may be used for future role-based filtering

  const byPhase = new Map<Phase, KanbanCase[]>();
  for (const phase of PHASES) byPhase.set(phase.key, []);
  for (const c of cases) byPhase.get(getPhase(c))!.push(c);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4" dir="rtl">
      {PHASES.map((phase) => {
        const phaseCases = byPhase.get(phase.key) ?? [];
        return (
          <div key={phase.key} className={`rounded-xl border ${phase.color} flex flex-col min-h-[12rem]`}>
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${phase.headerColor}`}>
              <span className="text-sm font-bold">{phase.label}</span>
              <span className="text-xs font-semibold opacity-70">{phaseCases.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-20rem)]">
              {phaseCases.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">אין תיקים</p>
              ) : (
                phaseCases.map((c) => (
                  <KanbanCard
                    key={c.id}
                    c={c}
                    onClick={() => router.push(`/cases/${c.id}`)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
