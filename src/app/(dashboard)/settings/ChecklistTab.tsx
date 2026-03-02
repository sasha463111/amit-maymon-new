'use client';

import { useState } from 'react';
import { updateWorkflowStep, addWorkflowStep, removeWorkflowStep } from '@/app/actions/settings';
import type { WorkflowStepTemplate } from '@/types/database';

const PROTECTED_KEYS = new Set(['OPEN_CASE', 'READY_FOR_OFFICE', 'CLOSE_CASE']);

interface ChecklistTabProps {
  initialSteps: WorkflowStepTemplate[];
}

export function ChecklistTab({ initialSteps }: ChecklistTabProps) {
  const [steps, setSteps] = useState<WorkflowStepTemplate[]>(
    [...initialSteps].sort((a, b) => a.order_index - b.order_index)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Add new step form
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function showMsg(text: string, ok: boolean) {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleEditSave(step: WorkflowStepTemplate) {
    const label = editLabel.trim();
    if (!label) return;
    setSaving(step.id);
    setEditingId(null);
    const res = await updateWorkflowStep(step.id, { step_label: label });
    setSaving(null);
    if (res.error) {
      showMsg(res.error, false);
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, step_label: step.step_label } : s)));
    } else {
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, step_label: label } : s)));
      showMsg('שם השלב עודכן', true);
    }
  }

  async function handleToggleEnabled(step: WorkflowStepTemplate) {
    if (PROTECTED_KEYS.has(step.step_key)) return;
    const newVal = !step.is_enabled;
    setSaving(step.id);
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, is_enabled: newVal } : s)));
    const res = await updateWorkflowStep(step.id, { is_enabled: newVal });
    setSaving(null);
    if (res.error) {
      showMsg(res.error, false);
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, is_enabled: !newVal } : s)));
    } else {
      showMsg(newVal ? 'שלב הופעל' : 'שלב הושבת', true);
    }
  }

  async function handleToggleRequiresLink(step: WorkflowStepTemplate) {
    const newVal = !step.requires_link;
    setSaving(step.id);
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, requires_link: newVal } : s)));
    const res = await updateWorkflowStep(step.id, { requires_link: newVal });
    setSaving(null);
    if (res.error) {
      showMsg(res.error, false);
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, requires_link: !newVal } : s)));
    } else {
      showMsg(newVal ? 'דורש קישור — הופעל' : 'דורש קישור — הושבת', true);
    }
  }

  async function handleToggleRequiresFileOrLink(step: WorkflowStepTemplate) {
    const newVal = !step.requires_file_or_link;
    setSaving(step.id);
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, requires_file_or_link: newVal } : s)));
    const res = await updateWorkflowStep(step.id, { requires_file_or_link: newVal });
    setSaving(null);
    if (res.error) {
      showMsg(res.error, false);
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, requires_file_or_link: !newVal } : s)));
    } else {
      showMsg(newVal ? 'דורש קובץ/קישור — הופעל' : 'דורש קובץ/קישור — הושבת', true);
    }
  }

  async function handleToggleRequiresCeoApproval(step: WorkflowStepTemplate) {
    const newVal = !step.requires_ceo_approval;
    setSaving(step.id);
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, requires_ceo_approval: newVal } : s)));
    const res = await updateWorkflowStep(step.id, { requires_ceo_approval: newVal });
    setSaving(null);
    if (res.error) {
      showMsg(res.error, false);
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, requires_ceo_approval: !newVal } : s)));
    } else {
      showMsg(newVal ? 'דורש אישור עמית — הופעל' : 'דורש אישור עמית — הושבת', true);
    }
  }

  async function handleRemove(step: WorkflowStepTemplate) {
    if (PROTECTED_KEYS.has(step.step_key)) return;
    if (!confirm(`האם אתה בטוח שברצונך להסיר את שלב "${step.step_label}"?`)) return;
    setSaving(step.id);
    const res = await removeWorkflowStep(step.id);
    setSaving(null);
    if (res.error) {
      showMsg(res.error, false);
    } else {
      setSteps((prev) => prev.filter((s) => s.id !== step.id));
      showMsg('השלב הוסר', true);
    }
  }

  async function handleAdd() {
    setAddError(null);
    if (!newLabel.trim()) { setAddError('נדרש שם שלב'); return; }
    setAdding(true);
    const maxIndex = steps.length > 0 ? Math.max(...steps.map((s) => s.order_index)) : 0;
    const stepKey = `CUSTOM_${Date.now()}`;
    const res = await addWorkflowStep({
      step_key: stepKey,
      step_label: newLabel.trim(),
      order_index: maxIndex + 1,
    });
    setAdding(false);
    if (res.error) {
      setAddError(res.error);
    } else {
      const newStep: WorkflowStepTemplate = {
        id: res.id ?? '',
        step_key: stepKey.toUpperCase(),
        step_label: newLabel.trim(),
        order_index: maxIndex + 1,
        is_enabled: true,
        requires_link: false,
        requires_file_or_link: false,
        requires_ceo_approval: false,
        created_at: new Date().toISOString(),
      };
      setSteps((prev) => [...prev, newStep].sort((a, b) => a.order_index - b.order_index));
      setNewLabel('');
      setShowAdd(false);
      showMsg('שלב נוסף', true);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">שלבי צ&apos;קליסט</h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          + הוסף שלב
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.ok
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.ok ? '✓' : '⚠️'} {message.text}
        </div>
      )}

      {showAdd && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-semibold text-blue-800 mb-2">שלב חדש</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="שם השלב"
              className="flex-1 border rounded px-3 py-1.5 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            />
            <button
              type="button"
              disabled={adding}
              onClick={() => void handleAdd()}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? 'מוסיף...' : 'הוסף'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddError(null); setNewLabel(''); }}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200"
            >
              ביטול
            </button>
          </div>
          {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step, i) => {
          const isProtected = PROTECTED_KEYS.has(step.step_key);
          const isSaving = saving === step.id;
          const isEditing = editingId === step.id;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                step.is_enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
              }`}
            >
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleEditSave(step);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleEditSave(step)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                      שמור
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{step.step_label}</span>
                    {isProtected && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">מוגן</span>
                    )}
                    {!step.is_enabled && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">מושבת</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {/* Requires link / file toggles */}
                {!isEditing && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleToggleRequiresLink(step)}
                    title="האם השלב דורש הזנת קישור?"
                    className={`px-2 py-1 text-xs rounded border transition-colors disabled:opacity-50 ${
                      step.requires_link
                        ? 'bg-blue-100 text-blue-700 border-blue-300 font-semibold'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    🔗 קישור
                  </button>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleToggleRequiresFileOrLink(step)}
                    title="האם השלב דורש קובץ או קישור?"
                    className={`px-2 py-1 text-xs rounded border transition-colors disabled:opacity-50 ${
                      step.requires_file_or_link
                        ? 'bg-purple-100 text-purple-700 border-purple-300 font-semibold'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-purple-300 hover:text-purple-600'
                    }`}
                  >
                    📎 קובץ/קישור
                  </button>
                )}

                {!isEditing && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleToggleRequiresCeoApproval(step)}
                    title="האם השלב דורש אישור עמית לפני שניתן להתקדם?"
                    className={`px-2 py-1 text-xs rounded border transition-colors disabled:opacity-50 ${
                      step.requires_ceo_approval
                        ? 'bg-amber-100 text-amber-700 border-amber-300 font-semibold'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-amber-300 hover:text-amber-600'
                    }`}
                  >
                    👑 אישור עמית
                  </button>
                )}

                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(step.id); setEditLabel(step.step_label); }}
                    className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                  >
                    ✏️ עריכה
                  </button>
                )}

                {!isProtected && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleToggleEnabled(step)}
                    className={`px-2 py-1 text-xs rounded ${
                      step.is_enabled
                        ? 'text-orange-600 hover:text-orange-800 hover:bg-orange-50'
                        : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                    } disabled:opacity-50`}
                  >
                    {isSaving ? '...' : step.is_enabled ? 'השבת' : 'הפעל'}
                  </button>
                )}

                {!isProtected && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleRemove(step)}
                    className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    🗑️ הסר
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
