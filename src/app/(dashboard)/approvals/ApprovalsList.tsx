'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

interface ApprovalRow {
  id: string;
  case_id: string;
  approval_type: string;
  rejection_note: string | null;
  case_key: string | null;
  fixcar_link: string | null;
  wheels_check_link: string | null;
  parts_status: string | null;
  plate: string;
  branch_name: string;
}

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  ESTIMATE_AND_DETAILS: 'אישור אומדן ופרטים',
  WHEELS_CHECK: 'אישור בדיקת גלגלים',
  CASE_CLOSURE: 'אישור סגירת תיק',
};

const PARTS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'זמינים ✅', color: 'text-green-600' },
  ORDERED: { label: 'הוזמנו ⏳', color: 'text-yellow-600' },
  NO_PARTS: { label: 'אין חלקים ❌', color: 'text-red-600' },
};

async function decideApprovalPreview(approvalId: string, status: 'APPROVED' | 'REJECTED', note?: string) {
  const supabase = (await import('@/lib/supabase/client')).createClient();
  const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from('ceo_approvals')
    .update({ status, rejection_note: note ?? null, decided_at: now, decided_by: user?.id ?? null } as never)
    .eq('id', approvalId);
}

interface CaseDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
}

function DocumentDownloadButton({ filePath, fileName }: { filePath: string; fileName: string }) {
  async function handleDownload() {
    const supabase = (await import('@/lib/supabase/client')).createClient();
    const { data } = await supabase.storage.from('case-documents').createSignedUrl(filePath, 60);
    if (data?.signedUrl) {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = fileName;
      a.target = '_blank';
      a.click();
    }
  }
  return (
    <button
      type="button"
      onClick={handleDownload}
      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex-shrink-0"
    >
      הורד
    </button>
  );
}

export function ApprovalsList({ approvals: initialApprovals }: { approvals: ApprovalRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localApprovals, setLocalApprovals] = useState<ApprovalRow[]>(initialApprovals);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // In PREVIEW: reload from localStorage on mount (server data is always stale)
  useEffect(() => {
    if (!isPreview) return;
    (async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data } = await supabase
        .from('ceo_approvals')
        .select(`id, case_id, approval_type, status, rejection_note,
          cases(id, case_key, fixcar_link, wheels_check_link, parts_status, cars(license_plate), branches(name))`)
        .eq('status', 'PENDING');
      if (!data) return;
      const rows = (data as unknown as Array<{
        id: string; case_id: string; approval_type: string; status: string; rejection_note: string | null;
        cases: { case_key: string | null; fixcar_link: string | null; wheels_check_link: string | null; parts_status: string;
          cars: { license_plate: string | null } | null; branches: { name: string } | null } | null;
      }>).map((a) => {
        const c = Array.isArray(a.cases) ? (a.cases as typeof a.cases[])[0] : a.cases;
        const car = c && (Array.isArray(c.cars) ? (c.cars as { license_plate: string | null }[])[0] : c.cars);
        const branch = c && (Array.isArray(c.branches) ? (c.branches as { name: string }[])[0] : c.branches);
        return {
          id: a.id, case_id: a.case_id, approval_type: a.approval_type,
          rejection_note: a.rejection_note, case_key: c?.case_key ?? null,
          fixcar_link: c?.fixcar_link ?? null, wheels_check_link: (c as { wheels_check_link?: string | null })?.wheels_check_link ?? null,
          parts_status: c?.parts_status ?? null,
          plate: car?.license_plate ?? '—', branch_name: branch?.name ?? '—',
        };
      });
      setLocalApprovals(rows);
      if (rows.length > 0) setSelectedId(rows[0].id);
    })().catch(console.error);
  }, []);

  // Load documents when selection changes
  useEffect(() => {
    if (!selectedId) { setDocuments([]); return; }
    const approval = localApprovals.find((a) => a.id === selectedId);
    if (!approval) return;
    setDocsLoading(true);
    (async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data } = await supabase
        .from('case_documents')
        .select('id, file_name, file_path, file_size, mime_type')
        .eq('case_id', approval.case_id)
        .order('created_at', { ascending: false });
      setDocuments((data ?? []) as CaseDocument[]);
      setDocsLoading(false);
    })().catch(() => setDocsLoading(false));
  }, [selectedId, localApprovals]);

  const selected = localApprovals.find((a) => a.id === selectedId);
  const parts = selected?.parts_status ? PARTS_STATUS_LABELS[selected.parts_status] : null;

  async function handleDecide(approvalId: string, status: 'APPROVED' | 'REJECTED') {
    setError(null);
    setLoading(true);
    if (isPreview) {
      await decideApprovalPreview(approvalId, status, status === 'REJECTED' ? rejectNote : undefined);
      setLocalApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      setSelectedId(null);
      setRejectNote('');
      setDocuments([]);
    } else {
      const { decideApproval: action } = await import('@/app/actions/approvals');
      const res = await action({ approval_id: approvalId, status, rejection_note: status === 'REJECTED' ? rejectNote : undefined });
      if (res?.error) setError(res.error);
      else { setLocalApprovals((prev) => prev.filter((a) => a.id !== approvalId)); setSelectedId(null); setRejectNote(''); setDocuments([]); }
    }
    setLoading(false);
  }

  if (localApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-lg font-semibold text-gray-700 mb-1">אין אישורים ממתינים</h3>
        <p className="text-gray-400 text-sm">כל האישורים טופלו</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Left: list */}
      <div className="w-72 flex-shrink-0">
        <p className="text-xs text-gray-500 mb-2 font-medium">ממתינים לאישור ({localApprovals.length})</p>
        <ul className="space-y-2">
          {localApprovals.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`w-full text-right p-3 rounded-xl border-2 transition-all ${
                  selectedId === a.id
                    ? 'border-indigo-400 bg-indigo-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50'
                }`}
              >
                <div className="font-semibold text-gray-800 text-sm">{a.case_key ?? a.plate}</div>
                <div className="text-xs text-gray-500 mt-0.5">{a.plate} · {a.branch_name}</div>
                <div className={`text-xs mt-1 font-medium ${selectedId === a.id ? 'text-indigo-600' : 'text-amber-600'}`}>
                  ⏳ {APPROVAL_TYPE_LABELS[a.approval_type] ?? a.approval_type}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Right: detail + actions */}
      <div className="flex-1">
        {selected ? (
          <div className="bg-white rounded-xl border-2 border-indigo-100 shadow-md p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800">{selected.case_key ?? selected.plate}</h3>
                <p className="text-sm text-gray-500 mt-0.5">רישוי: {selected.plate} · סניף: {selected.branch_name}</p>
              </div>
              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                ממתין לאישור
              </span>
            </div>

            {/* Approval type */}
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-xs text-indigo-500 font-medium mb-1">סוג אישור</p>
              <p className="font-semibold text-indigo-800">
                {APPROVAL_TYPE_LABELS[selected.approval_type] ?? selected.approval_type}
              </p>
            </div>

            {/* Case details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">סטטוס חלקים</p>
                <p className={`font-semibold ${parts?.color ?? 'text-gray-700'}`}>{parts?.label ?? selected.parts_status ?? '—'}</p>
              </div>
            </div>

            {/* לינקים וקבצים מצורפים — כל הלינקים והקבצים מהצ'קליסט */}
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
              <p className="text-sm font-semibold text-indigo-800 mb-2">🔗 לינקים וקבצים מצורפים</p>
              <ul className="space-y-2 text-sm">
                {selected.fixcar_link && (
                  <li className="flex items-center gap-2">
                    <span className="text-indigo-600 font-medium">FixCar:</span>
                    <a href={selected.fixcar_link} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800 truncate max-w-[280px]">
                      {selected.fixcar_link}
                    </a>
                    <a href={selected.fixcar_link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 flex-shrink-0">פתח ↗</a>
                  </li>
                )}
                {selected.wheels_check_link && (
                  <li className="flex items-center gap-2">
                    <span className="text-indigo-600 font-medium">טפסי גלגלים:</span>
                    <a href={selected.wheels_check_link} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800 truncate max-w-[280px]">
                      {selected.wheels_check_link}
                    </a>
                    <a href={selected.wheels_check_link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 flex-shrink-0">פתח ↗</a>
                  </li>
                )}
                {!selected.fixcar_link && !selected.wheels_check_link && (
                  <li className="text-gray-500 text-xs">אין לינקים מוזנים</li>
                )}
              </ul>
            </div>

            {/* View full case button */}
            <div className="border-t pt-4 mb-4">
              <Link
                href={`/cases/${selected.case_id}?from=approvals`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <span>👁️</span>
                <span>צפה בתיק המלא</span>
              </Link>
            </div>

            {/* Case Documents — קבצים מהצ'קליסט עבודה */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">📎 מסמכים שהועלו לתיק (כולל מהצ'קליסט)</p>
              {docsLoading ? (
                <p className="text-xs text-gray-400">טוען מסמכים...</p>
              ) : documents.length === 0 ? (
                <p className="text-xs text-gray-400">אין מסמכים מועלים לתיק זה</p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-lg">
                        {doc.mime_type?.startsWith('image/') ? '🖼️' : doc.mime_type === 'application/pdf' ? '📄' : '📎'}
                      </span>
                      <span className="flex-1 truncate text-gray-700 font-medium text-xs">{doc.file_name}</span>
                      <DocumentDownloadButton filePath={doc.file_path} fileName={doc.file_name} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">החלטה:</p>
              <div className="flex gap-3 items-start flex-wrap">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleDecide(selected.id, 'APPROVED')}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? '...' : '✓ אשר'}
                </button>
                <div className="flex gap-2 items-center flex-1">
                  <input
                    type="text"
                    placeholder="הערה לדחייה (אופציונלי)"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 min-w-0"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDecide(selected.id, 'REJECTED')}
                    className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm flex-shrink-0"
                  >
                    ✕ דחה
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <p className="text-4xl mb-3">👆</p>
            <p className="text-sm">בחר אישור מהרשימה</p>
          </div>
        )}
      </div>
    </div>
  );
}
