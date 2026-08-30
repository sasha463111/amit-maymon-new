'use client';

import { useMemo, useState } from 'react';
import { updateCaseDetails } from '@/app/actions/caseDetails';
import type { PainterStatus } from '@/types/database';
import { PAINTER_STATUS_LABELS, SUB_CLAIM_LABELS, INSURANCE_TYPE_LABELS, CLAIM_TYPE_LABELS } from '@/types/database';
import { LicensePlate } from '@/components/ui/LicensePlate';

/**
 * Extracted from CaseDetailClientV2.tsx (second step of the god-component
 * refactor, after the "safe" batch — status banner/documents/timeline). This
 * one's state (field editing, notes, painter status) was checked to be used
 * ONLY within this card in the parent, so unlike DocumentsSection it's fully
 * self-contained here rather than lifted — the parent no longer owns any of
 * this state at all.
 */

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
  renderDisplay,
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
  renderDisplay?: (rawValue: string) => React.ReactNode;
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
      ) : renderDisplay ? (
        <span
          className={`flex-1 ${canEdit ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-blue-50 transition-colors' : ''}`}
          onClick={canEdit ? () => onStartEdit(field, rawValue) : undefined}
          title={canEdit ? `לחץ לעריכת ${label}` : undefined}
        >
          {renderDisplay(rawValue)}
        </span>
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

export function CaseDetailsSection({
  caseId,
  role,
  branchName,
  openedAt,
  age,
  plate,
  claimNumber,
  customerName,
  phone,
  insuranceCompany,
  appraiserName,
  eventDate,
  insuranceType,
  claimType,
  subClaimType,
  carMake,
  carModel,
  carVin,
  vehicleType,
  vehicleYear,
  initialNotes,
  initialPainterStatus,
  initialPainterStatusOtherText,
  initialSubClaimTypeOtherText,
}: {
  caseId: string;
  role: string | null;
  branchName: string;
  openedAt: string | null;
  age: string;
  plate: string;
  claimNumber: string | null;
  customerName: string | null;
  phone: string | null;
  insuranceCompany: string | null;
  appraiserName: string | null;
  eventDate: string | null;
  insuranceType: string | null;
  claimType: string | null;
  subClaimType: string | null;
  carMake: string | null;
  carModel: string | null;
  carVin: string | null;
  vehicleType: string | null;
  vehicleYear: number | null;
  initialNotes: string | null;
  initialPainterStatus: string | null;
  initialPainterStatusOtherText: string | null;
  initialSubClaimTypeOtherText: string | null;
}) {
  const canEdit = role === 'SERVICE_MANAGER' || role === 'CEO' || role === 'SERVICE_ADVISOR';
  const canEditDetails = role !== 'PAINTER' && role !== null;

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
      // Leaving OTHER clears the free text — same reasoning as painter_status
      // above: otherwise stale wording could resurface if switched back later.
      if (field === 'subClaimType' && value !== 'OTHER') {
        caseUpdates.sub_claim_type_other_text = null;
        setSubClaimTypeOtherText('');
      }
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

  const [notes, setNotes] = useState(initialNotes ?? '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  async function saveNotes() {
    if (!notesDirty) return;
    setNotesSaving(true);
    setNotesDirty(false);
    await updateCaseDetails(caseId, { notes: notes || null });
    setNotesSaving(false);
  }

  const [painterStatus, setPainterStatus] = useState<PainterStatus | ''>(
    (initialPainterStatus as PainterStatus | null) ?? ''
  );
  const [painterStatusOtherText, setPainterStatusOtherText] = useState(initialPainterStatusOtherText ?? '');
  const [painterStatusOtherSaving, setPainterStatusOtherSaving] = useState(false);

  async function savePainterStatus(val: PainterStatus | '') {
    setPainterStatus(val);
    // Clear the custom text the moment we leave OTHER — otherwise it lingers
    // in the DB and could resurface if the status is switched back to OTHER
    // later showing stale wording nobody typed just now.
    if (val !== 'OTHER') setPainterStatusOtherText('');
    const res = await updateCaseDetails(caseId, {
      painter_status: val || null,
      ...(val !== 'OTHER' ? { painter_status_other_text: null } : {}),
    });
    if (res?.error) console.error('[savePainterStatus] failed', res.error);
  }

  async function savePainterStatusOtherText(text: string) {
    setPainterStatusOtherText(text);
    setPainterStatusOtherSaving(true);
    const res = await updateCaseDetails(caseId, { painter_status_other_text: text || null });
    if (res?.error) console.error('[savePainterStatusOtherText] failed', res.error);
    setPainterStatusOtherSaving(false);
  }

  const [subClaimTypeOtherText, setSubClaimTypeOtherText] = useState(initialSubClaimTypeOtherText ?? '');
  const [subClaimTypeOtherSaving, setSubClaimTypeOtherSaving] = useState(false);

  async function saveSubClaimTypeOtherText(text: string) {
    setSubClaimTypeOtherText(text);
    setSubClaimTypeOtherSaving(true);
    const res = await updateCaseDetails(caseId, { sub_claim_type_other_text: text || null });
    if (res?.error) console.error('[saveSubClaimTypeOtherText] failed', res.error);
    setSubClaimTypeOtherSaving(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 sm:p-6">
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
        <EditableInfoRow label="רישוי" field="plate" fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit} renderDisplay={(v) => v ? <LicensePlate plate={v} size="sm" /> : <span className="text-gray-800">—</span>} />
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
            { value: 'MILITARY', label: 'צה"ל' },
            { value: 'OTHER', label: 'אחר' },
          ]}
          displayMap={SUB_CLAIM_LABELS}
          renderDisplay={(v) => (
            <span className="text-gray-800">
              {v ? (SUB_CLAIM_LABELS[v] ?? v) : '—'}
              {v === 'OTHER' && subClaimTypeOtherText ? `: ${subClaimTypeOtherText}` : ''}
            </span>
          )}
          fieldValues={fieldValues} editingField={editingField} editValue={editValue} canEdit={canEditDetails} onStartEdit={startEdit} onEditChange={setEditValue} onSave={() => void saveField()} onCancel={cancelEdit}
        />
      </div>

      {/* ── תת סוג תביעה: "אחר" — טקסט חופשי ── */}
      {canEditDetails && fieldValues.subClaimType === 'OTHER' && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            פירוט תת סוג תביעה {subClaimTypeOtherSaving && <span className="text-xs text-gray-400">שומר...</span>}
          </label>
          <input
            type="text"
            defaultValue={subClaimTypeOtherText}
            onBlur={(e) => void saveSubClaimTypeOtherText(e.target.value)}
            placeholder="פרט את סוג התביעה"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none"
          />
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
          {painterStatus === 'OTHER' && (
            <div className="mt-2">
              <input
                type="text"
                value={painterStatusOtherText}
                onChange={(e) => setPainterStatusOtherText(e.target.value)}
                onBlur={() => void savePainterStatusOtherText(painterStatusOtherText)}
                placeholder="פירוט הסטטוס..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none"
              />
              {painterStatusOtherSaving && <span className="text-xs text-gray-400">שומר...</span>}
            </div>
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
  );
}
