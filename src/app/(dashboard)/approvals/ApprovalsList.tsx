'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';

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
  customer_name?: string | null;
  phone?: string | null;
  insurance_company?: string | null;
  appraiser_name?: string | null;
  notes?: string | null;
}

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  ESTIMATE_AND_DETAILS: 'אישור אומדן ופרטים',
  WHEELS_CHECK: 'אישור בדיקת גלגלים',
  CASE_CLOSURE: 'אישור סגירת תיק',
};

function getApprovalLabel(type: string): string {
  return APPROVAL_TYPE_LABELS[type] ?? `אישור שלב: ${type}`;
}

const PARTS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'זמינים ✅', color: 'text-green-600' },
  ORDERED: { label: 'הוזמנו ⏳', color: 'text-yellow-600' },
  NO_PARTS: { label: 'אין חלקים ❌', color: 'text-red-600' },
};

const STEP_LABELS: Record<string, string> = {
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

const SUB_CLAIM_LABELS: Record<string, string> = {
  POLICY: 'פוליסה',
  THIRD_PARTY: "צד ג'",
  THIRD_PARTY_SETTLEMENT: "הסדר ג'",
  PRIVATE_REPAIR: 'תיקון פרטי',
  SHLOMO_POLICY: 'מוקד שלמה פוליסה',
  SHLOMO_THIRD_PARTY: "מוקד שלמה צד ג'",
};

const EXTRAS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'ממתין', color: 'text-yellow-600 bg-yellow-50' },
  IN_TREATMENT: { label: 'בטיפול', color: 'text-blue-600 bg-blue-50' },
  DONE: { label: 'הושלם', color: 'text-green-600 bg-green-50' },
  CANCELLED: { label: 'בוטל', color: 'text-gray-500 bg-gray-50' },
};

interface CaseDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
}

interface CaseInfo {
  customer_name: string | null;
  phone: string | null;
  insurance_company: string | null;
  appraiser_name: string | null;
  claim_number: string | null;
  sub_claim_type: string | null;
  claim_type: string | null;
  opened_at: string | null;
  car_make: string | null;
  car_model: string | null;
  car_vin: string | null;
  vehicle_year: number | null;
  notes: string | null;
  painter_status: string | null;
}

interface WorkflowStep {
  id: string;
  step_key: string;
  state: string;
  order_index: number;
}

interface BodyworkExtra {
  id: string;
  description: string;
  status: string;
  created_at: string;
}

function DocumentTile({ doc }: { doc: CaseDocument }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();
      const { data } = await supabase.storage.from('case-documents').createSignedUrl(doc.file_path, 3600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [doc.file_path]);

  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf = doc.mime_type === 'application/pdf';

  return (
    <a
      href={signedUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { if (!signedUrl) e.preventDefault(); }}
      className="group block bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {isImage && signedUrl ? (
          <img src={signedUrl} alt={doc.file_name} loading="lazy" className="w-full h-full object-cover" />
        ) : isPdf ? (
          <div className="flex flex-col items-center text-gray-500">
            <span className="text-4xl">📄</span>
            <span className="text-[10px] font-semibold mt-1">PDF</span>
          </div>
        ) : (
          <span className="text-4xl text-gray-400">📎</span>
        )}
      </div>
      <div className="p-2 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-800 truncate" title={doc.file_name}>{doc.file_name}</p>
      </div>
    </a>
  );
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

async function decideApprovalPreview(approvalId: string, status: 'APPROVED' | 'REJECTED', note?: string) {
  const supabase = (await import('@/lib/supabase/client')).createClient();
  const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from('ceo_approvals')
    .update({ status, rejection_note: note ?? null, decided_at: now, decided_by: user?.id ?? null } as never)
    .eq('id', approvalId);
}

type TabKey = 'approval' | 'caseInfo' | 'steps' | 'extras' | 'docs';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'approval', label: 'אישור', icon: '✅' },
  { key: 'caseInfo', label: 'פרטי תיק', icon: '📋' },
  { key: 'steps', label: 'שלבי עבודה', icon: '🔧' },
  { key: 'extras', label: 'תוספות', icon: '➕' },
  { key: 'docs', label: 'מסמכים', icon: '📎' },
];

export function ApprovalsList({ approvals: initialApprovals }: { approvals: ApprovalRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialApprovals[0]?.id ?? null);
  const [rejectNote, setRejectNote] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localApprovals, setLocalApprovals] = useState<ApprovalRow[]>(initialApprovals);
  const [activeTab, setActiveTab] = useState<TabKey>('approval');

  // Per-case data
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [caseInfoLoading, setCaseInfoLoading] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [extras, setExtras] = useState<BodyworkExtra[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(false);

  // In PREVIEW: reload approvals from DB on mount
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

  // Fetch all case data when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDocuments([]);
      setCaseInfo(null);
      setWorkflowSteps([]);
      setExtras([]);
      return;
    }
    const approval = localApprovals.find((a) => a.id === selectedId);
    if (!approval) return;
    const caseId = approval.case_id;

    // Documents
    setDocsLoading(true);
    // Case info
    setCaseInfoLoading(true);
    // Steps
    setStepsLoading(true);
    // Extras
    setExtrasLoading(true);

    (async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient();

      const [docsResult, runsResult, extrasResult] = await Promise.all([
        supabase.from('case_documents').select('id, file_name, file_path, file_size, mime_type').eq('case_id', caseId).order('created_at', { ascending: false }),
        supabase.from('case_workflow_runs').select('id').eq('case_id', caseId).eq('workflow_type', 'PROFESSIONAL').eq('status', 'ACTIVE'),
        supabase.from('bodywork_extras').select('id, description, status, created_at').eq('case_id', caseId).order('created_at', { ascending: false }),
      ]);
      const caseResult = await (supabase
        .from('cases')
        .select('opened_at, notes, painter_status, claim_number, customer_name, phone, insurance_company, appraiser_name, sub_claim_type, claim_type, cars(make, model, vin, year)')
        .eq('id', caseId)
        .single() as unknown as Promise<{ data: unknown; error: unknown }>);

      setDocuments((docsResult.data ?? []) as CaseDocument[]);
      setDocsLoading(false);

      if (caseResult.data) {
        type CarShape = { make: string | null; model: string | null; vin: string | null; year: number | null };
        type CaseShape = {
          opened_at: string | null;
          notes: string | null;
          painter_status: string | null;
          claim_number: string | null;
          customer_name: string | null;
          phone: string | null;
          insurance_company: string | null;
          appraiser_name: string | null;
          sub_claim_type: string | null;
          claim_type: string | null;
          cars: CarShape | CarShape[] | null;
        };
        const c = caseResult.data as unknown as CaseShape;
        const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
        setCaseInfo({
          customer_name: c.customer_name ?? null,
          phone: c.phone ?? null,
          insurance_company: c.insurance_company ?? null,
          appraiser_name: c.appraiser_name ?? null,
          claim_number: c.claim_number ?? null,
          sub_claim_type: c.sub_claim_type ?? null,
          claim_type: c.claim_type ?? null,
          opened_at: c.opened_at ?? null,
          car_make: car?.make ?? null,
          car_model: car?.model ?? null,
          car_vin: car?.vin ?? null,
          vehicle_year: car?.year ?? null,
          notes: c.notes ?? null,
          painter_status: c.painter_status ?? null,
        });
      }
      setCaseInfoLoading(false);

      const runIds = ((runsResult.data ?? []) as { id: string }[]).map((r) => r.id);
      if (runIds.length > 0) {
        const { data: stepsData } = await supabase
          .from('case_workflow_steps')
          .select('id, step_key, state, order_index')
          .in('run_id', runIds)
          .order('order_index');
        setWorkflowSteps((stepsData ?? []) as WorkflowStep[]);
      } else {
        setWorkflowSteps([]);
      }
      setStepsLoading(false);

      setExtras((extrasResult.data ?? []) as BodyworkExtra[]);
      setExtrasLoading(false);
    })().catch(() => {
      setDocsLoading(false);
      setCaseInfoLoading(false);
      setStepsLoading(false);
      setExtrasLoading(false);
    });
  }, [selectedId, localApprovals]);

  const selected = localApprovals.find((a) => a.id === selectedId);
  const parts = selected?.parts_status ? PARTS_STATUS_LABELS[selected.parts_status] : null;

  async function handleDecide(approvalId: string, status: 'APPROVED' | 'REJECTED') {
    setError(null);
    const note = status === 'REJECTED' ? rejectNote : undefined;

    if (isPreview) {
      setDecidingId(approvalId);
      await decideApprovalPreview(approvalId, status, note);
      setLocalApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      setSelectedId((prev) => {
        const next = localApprovals.filter((a) => a.id !== approvalId);
        return next[0]?.id ?? next[next.length - 1]?.id ?? null;
      });
      setRejectNote('');
      setDocuments([]);
      setDecidingId(null);
      return;
    }

    const nextList = localApprovals.filter((a) => a.id !== approvalId);
    const nextSelectedId = nextList[0]?.id ?? nextList[nextList.length - 1]?.id ?? null;
    setLocalApprovals(nextList);
    setSelectedId(nextSelectedId);
    setRejectNote('');
    setDocuments([]);

    const { decideApproval: action } = await import('@/app/actions/approvals');
    action({ approval_id: approvalId, status, rejection_note: note }).then((res) => {
      if (res?.error) {
        setError(res.error);
        router.refresh();
      }
    });
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
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full" dir="rtl">
      {/* Right: list (RTL so this is left side visually) — full width on mobile, fixed on desktop */}
      <div className="w-full lg:w-72 flex-shrink-0">
        <p className="text-xs text-gray-500 mb-2 font-medium">ממתינים לאישור ({localApprovals.length})</p>
        {/* Horizontal scroller on mobile (lg+ becomes vertical list via space-y) */}
        <ul className="flex lg:block gap-2 lg:space-y-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-3 lg:mx-0 px-3 lg:px-0">
          {localApprovals.map((a) => (
            <li key={a.id} className="shrink-0 lg:shrink min-w-[240px] lg:min-w-0">
              <button
                type="button"
                onClick={() => { setSelectedId(a.id); setActiveTab('approval'); }}
                className={`w-full text-right p-3 rounded-xl border-2 transition-all ${
                  selectedId === a.id
                    ? 'border-indigo-400 bg-indigo-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-800 text-sm truncate">
                    {a.customer_name ?? a.case_key ?? a.plate}
                  </div>
                  {a.notes && (
                    <span
                      title={a.notes}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold shrink-0"
                      aria-label="יש הערה"
                    >
                      !
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                  {a.plate !== '—' && <LicensePlate plate={a.plate} size="sm" />}
                  <span>{a.branch_name}</span>
                </div>
                <div className={`text-xs mt-1 font-medium ${selectedId === a.id ? 'text-indigo-600' : 'text-amber-600'}`}>
                  ⏳ {getApprovalLabel(a.approval_type)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <div className="bg-white rounded-xl border-2 border-indigo-100 shadow-md overflow-hidden">
            {/* Case header */}
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800">{selected.case_key ?? selected.plate}</h3>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  {selected.plate !== '—' && <LicensePlate plate={selected.plate} size="sm" />}
                  <span>סניף: {selected.branch_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                  ⏳ {getApprovalLabel(selected.approval_type)}
                </span>
                <Link
                  href={`/cases/${selected.case_id}?from=approvals`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                >
                  👁️ פתח תיק
                </Link>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4 bg-gray-50">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-500 text-indigo-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.key === 'extras' && extras.length > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      extras.some((e) => e.status === 'IN_TREATMENT') ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {extras.length}
                    </span>
                  )}
                  {tab.key === 'docs' && documents.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                      {documents.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-6">
              {/* ── Tab: אישור ── */}
              {activeTab === 'approval' && (
                <div className="space-y-5">
                  {/* Customer quick summary */}
                  {(selected.customer_name || selected.phone || selected.insurance_company || selected.appraiser_name) && (
                    <div className="bg-gradient-to-l from-indigo-50 to-blue-50 rounded-lg p-4 border border-indigo-100">
                      <p className="text-xs font-semibold text-indigo-700 mb-2">פרטי לקוח ותביעה</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {selected.customer_name && (
                          <div>
                            <p className="text-xs text-gray-500">לקוח</p>
                            <p className="font-semibold text-gray-800">{selected.customer_name}</p>
                          </div>
                        )}
                        {selected.phone && (
                          <div>
                            <p className="text-xs text-gray-500">טלפון</p>
                            <p className="font-medium text-gray-800" dir="ltr">{selected.phone}</p>
                          </div>
                        )}
                        {selected.insurance_company && (
                          <div>
                            <p className="text-xs text-gray-500">חברת ביטוח</p>
                            <p className="font-medium text-gray-800">{selected.insurance_company}</p>
                          </div>
                        )}
                        {selected.appraiser_name && (
                          <div>
                            <p className="text-xs text-gray-500">שמאי</p>
                            <p className="font-medium text-gray-800">{selected.appraiser_name}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes — shown prominently on the approval tab */}
                  {selected.notes && (
                    <div className="bg-amber-50 rounded-lg p-4 border-2 border-amber-200">
                      <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                        📝 הערות מהמוסך
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.notes}</p>
                    </div>
                  )}

                  {/* Parts status */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">סטטוס חלקים</p>
                      <p className={`font-semibold ${parts?.color ?? 'text-gray-700'}`}>{parts?.label ?? selected.parts_status ?? '—'}</p>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                    <p className="text-sm font-semibold text-indigo-800 mb-2">🔗 לינקים</p>
                    <ul className="space-y-2 text-sm">
                      {selected.fixcar_link && (
                        <li className="flex items-center gap-2">
                          <span className="text-indigo-600 font-medium">FixCar:</span>
                          <a href={selected.fixcar_link} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800 truncate max-w-[240px]">
                            {selected.fixcar_link}
                          </a>
                          <a href={selected.fixcar_link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 flex-shrink-0">פתח ↗</a>
                        </li>
                      )}
                      {selected.wheels_check_link && (
                        <li className="flex items-center gap-2">
                          <span className="text-indigo-600 font-medium">גלגלים:</span>
                          <a href={selected.wheels_check_link} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800 truncate max-w-[240px]">
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

                  {/* Decision */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">החלטה:</p>
                    <div className="flex gap-3 items-start flex-wrap">
                      <button
                        type="button"
                        disabled={decidingId === selected.id}
                        onClick={() => void handleDecide(selected.id, 'APPROVED')}
                        className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {decidingId === selected.id ? '...' : '✓ אשר'}
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
                          disabled={decidingId === selected.id}
                          onClick={() => void handleDecide(selected.id, 'REJECTED')}
                          className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm flex-shrink-0"
                        >
                          ✕ דחה
                        </button>
                      </div>
                    </div>
                    {error && <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>}
                  </div>
                </div>
              )}

              {/* ── Tab: פרטי תיק ── */}
              {activeTab === 'caseInfo' && (
                <div>
                  {caseInfoLoading ? (
                    <p className="text-sm text-gray-400">טוען פרטים...</p>
                  ) : caseInfo ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: 'שם לקוח', value: caseInfo.customer_name },
                        { label: 'טלפון', value: caseInfo.phone },
                        { label: 'חברת ביטוח', value: caseInfo.insurance_company },
                        { label: 'שמאי', value: caseInfo.appraiser_name },
                        { label: 'מס׳ תביעה', value: caseInfo.claim_number },
                        { label: 'סוג תביעה', value: caseInfo.sub_claim_type ? (SUB_CLAIM_LABELS[caseInfo.sub_claim_type] ?? caseInfo.sub_claim_type) : null },
                        { label: 'יצרן', value: caseInfo.car_make },
                        { label: 'דגם', value: caseInfo.car_model },
                        { label: 'שנה', value: caseInfo.vehicle_year?.toString() ?? null },
                        { label: 'מספר שלדה', value: caseInfo.car_vin },
                        { label: 'תאריך פתיחה', value: caseInfo.opened_at ? new Date(caseInfo.opened_at).toLocaleDateString('he-IL') : null },
                        { label: 'סטטוס פחח', value: caseInfo.painter_status },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                          <p className="font-medium text-gray-800">{value ?? '—'}</p>
                        </div>
                      ))}
                      {caseInfo.notes && (
                        <div className="col-span-2 bg-amber-50 rounded-lg p-3 border border-amber-100">
                          <p className="text-xs text-gray-400 mb-0.5">הערות</p>
                          <p className="text-sm text-gray-700">{caseInfo.notes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">אין מידע</p>
                  )}
                </div>
              )}

              {/* ── Tab: שלבי עבודה ── */}
              {activeTab === 'steps' && (
                <div>
                  {stepsLoading ? (
                    <p className="text-sm text-gray-400">טוען שלבים...</p>
                  ) : workflowSteps.length === 0 ? (
                    <p className="text-sm text-gray-400">אין workflow פעיל</p>
                  ) : (
                    <ul className="space-y-2">
                      {workflowSteps.map((s) => {
                        const isDone = s.state === 'DONE';
                        const isActive = s.state === 'ACTIVE';
                        return (
                          <li
                            key={s.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                              isDone ? 'bg-green-50 border-green-200' :
                              isActive ? 'bg-blue-50 border-blue-300' :
                              'bg-gray-50 border-gray-100 opacity-60'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isDone ? 'bg-green-500 text-white' :
                              isActive ? 'bg-blue-500 text-white' :
                              'bg-gray-200 text-gray-400'
                            }`}>
                              {isDone ? '✓' : s.order_index + 1}
                            </div>
                            <span className={`text-sm font-medium ${
                              isDone ? 'text-green-700 line-through' :
                              isActive ? 'text-blue-800' : 'text-gray-500'
                            }`}>
                              {STEP_LABELS[s.step_key] ?? s.step_key}
                            </span>
                            {isActive && (
                              <span className="mr-auto text-xs text-blue-500 font-semibold">← שלב נוכחי</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* ── Tab: תוספות פחחות ── */}
              {activeTab === 'extras' && (
                <div>
                  {extrasLoading ? (
                    <p className="text-sm text-gray-400">טוען תוספות...</p>
                  ) : extras.length === 0 ? (
                    <p className="text-sm text-gray-400">אין תוספות לתיק זה</p>
                  ) : (
                    <ul className="space-y-2">
                      {extras.map((e) => {
                        const statusInfo = EXTRAS_STATUS_LABELS[e.status] ?? { label: e.status, color: 'text-gray-600 bg-gray-50' };
                        return (
                          <li key={e.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-800">{e.description}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(e.created_at).toLocaleDateString('he-IL')}
                              </p>
                            </div>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* ── Tab: מסמכים ── */}
              {activeTab === 'docs' && (
                <div>
                  {docsLoading ? (
                    <p className="text-sm text-gray-400">טוען מסמכים...</p>
                  ) : documents.length === 0 ? (
                    <p className="text-sm text-gray-400">אין מסמכים מועלים לתיק זה</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {documents.map((doc) => (
                        <DocumentTile key={doc.id} doc={doc} />
                      ))}
                    </div>
                  )}
                </div>
              )}
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
