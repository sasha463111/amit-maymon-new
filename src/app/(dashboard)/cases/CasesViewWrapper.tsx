'use client';

import { useState, useEffect } from 'react';
import { LayoutList, LayoutGrid } from 'lucide-react';
import { CasesTable } from './CasesTable';
import { CasesKanban, type KanbanCase } from './CasesKanban';
import type { PartsStatus } from '@/types/database';

interface CaseForView {
  id: string;
  plate: string;
  claim: string;
  case_key: string | null;
  opened_at: string | null;
  age: string;
  parts_status: PartsStatus;
  general_status: string;
  hasExtrasInTreatment: boolean;
  approvalBlocked: boolean;
  nextStep: string | null;
  activeStepKey: string | null;
  notes: string | null;
  painter_status: string | null;
}

export function CasesViewWrapper({
  cases,
  role,
}: {
  cases: CaseForView[];
  role: string | null;
}) {
  const [view, setView] = useState<'table' | 'kanban'>('table');

  useEffect(() => {
    const stored = localStorage.getItem('casesView');
    if (stored === 'kanban' || stored === 'table') setView(stored);
  }, []);

  function switchView(v: 'table' | 'kanban') {
    setView(v);
    localStorage.setItem('casesView', v);
  }

  const kanbanCases: KanbanCase[] = cases.map((c) => ({
    id: c.id,
    plate: c.plate,
    claim: c.claim,
    case_key: c.case_key,
    opened_at: c.opened_at,
    parts_status: c.parts_status,
    nextStep: c.nextStep,
    activeStepKey: c.activeStepKey,
    notes: c.notes,
    hasExtrasInTreatment: c.hasExtrasInTreatment,
    approvalBlocked: c.approvalBlocked,
  }));

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      {/* View toggle toolbar */}
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-gray-100">
        <button
          type="button"
          onClick={() => switchView('table')}
          title="תצוגת רשימה"
          className={`p-1.5 rounded-md transition-colors ${
            view === 'table'
              ? 'bg-brand-red text-white'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
        >
          <LayoutList size={16} />
        </button>
        <button
          type="button"
          onClick={() => switchView('kanban')}
          title="תצוגת קנבן"
          className={`p-1.5 rounded-md transition-colors ${
            view === 'kanban'
              ? 'bg-brand-red text-white'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
        >
          <LayoutGrid size={16} />
        </button>
      </div>

      {view === 'table' ? (
        <CasesTable cases={cases} role={role} />
      ) : (
        <CasesKanban cases={kanbanCases} role={role} />
      )}
    </div>
  );
}
