'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addLoanerDocs,
  createHandover,
  findCaseForLoaner,
  returnHandover,
  resendLoanerCopy,
  saveFleetCar,
  type ShareLink,
  type FleetCar,
  type Handover,
} from '@/app/actions/loaners';
import { loanerDocuments, waiverCost, FUEL_LEVELS, MIN_DRIVER_AGE, MIN_LICENSE_YEARS, WAIVER_MAX_ILS, WAIVER_PER_DAY_ILS } from '@/lib/loaners';
import { SignaturePad } from '@/components/SignaturePad';
import { shrinkImage } from '@/lib/shrinkImage';

// "מעקב רכב חליפי" (Amit, 2026-10-14) — office + CEO.

type Tab = 'out' | 'back' | 'fleet';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const days = (from: string, to: string | null) => Math.max(0, Math.floor(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 86_400_000));

/** Label / value rows, one per line (Amit's rule). */
function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">{children}</dl>;
}
function F({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <>
      <dt className="text-gray-400 whitespace-nowrap">{label}:</dt>
      <dd className={`min-w-0 break-words ${tone ?? 'text-gray-800'}`}>{children}</dd>
    </>
  );
}

async function uploadDocsOneByOne(handoverId: string, stage: 'OUT' | 'IN', files: File[]): Promise<number> {
  let failed = 0;
  for (const f of files) {
    const fd = new FormData();
    fd.append('handover_id', handoverId);
    fd.append('stage', stage);
    fd.append('docs', f.type.startsWith('image/') ? await shrinkImage(f) : f);
    const r = await addLoanerDocs(fd).catch(() => ({ error: 'x' }));
    if ('error' in r && r.error) failed++;
  }
  return failed;
}

export function LoanersClient({ fleet, handovers, branches, error }: { fleet: FleetCar[]; handovers: Handover[]; branches: { id: string; name: string }[]; error: string | null }) {
  const [tab, setTab] = useState<Tab>('out');
  const [query, setQuery] = useState('');
  const [giving, setGiving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // The customer's copy of the signed documents — sent on WhatsApp (Amit, 14/10).
  const [share, setShare] = useState<ShareLink | null>(null);
  const q = query.trim().toLowerCase().replace(/-/g, '');

  const out = handovers.filter((h) => !h.returned_at);
  const back = handovers.filter((h) => h.returned_at);
  const match = (h: Handover) =>
    !q || [h.loaner_plate, h.loaner_type, h.customer_plate, h.customer_name, h.customer_phone, h.branch_name].some((v) => (v ?? '').toLowerCase().replace(/-/g, '').includes(q));
  const shown = useMemo(() => (tab === 'out' ? out : back).filter(match), [tab, out, back, q]); // eslint-disable-line react-hooks/exhaustive-deps

  function done(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚗 מעקב רכב חליפי</h1>
          <p className="text-sm text-gray-500">מסירה ללקוח, חתימה על ההסכם, סריקת מסמכים והחזרה</p>
        </div>
        <button type="button" onClick={() => setGiving(true)} className="px-5 py-3 bg-red-600 text-white rounded-xl text-base font-bold shadow-sm">
          🚗 מסירת רכב חליפי
        </button>
      </div>
      {toast && <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm font-semibold">{toast}</div>}
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          ['out', `אצל לקוחות (${out.length})`],
          ['back', `הוחזרו (${back.length})`],
          ['fleet', `צי רכבים חליפיים (${fleet.filter((f) => f.active).length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'fleet' ? (
        <FleetTab fleet={fleet} branches={branches} handovers={out} onDone={done} />
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔎 חיפוש: מספר רכב חליפי, מספר רכב הלקוח, שם לקוח, טלפון…"
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm"
            dir="auto"
          />
          {shown.length === 0 && <p className="text-gray-400 py-8 text-center">{tab === 'out' ? 'אין כרגע רכבים חליפיים אצל לקוחות' : 'אין החזרות'}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((h) => (
              <HandoverCard key={h.id} h={h} onDone={done} onShare={setShare} />
            ))}
          </div>
        </>
      )}

      {giving && (
        <GiveDialog
          fleet={fleet.filter((f) => f.active && !f.busy)}
          branches={branches}
          onClose={() => setGiving(false)}
          onSaved={(m, sh) => {
            setGiving(false);
            setTab('out');
            done(m);
            if (sh) setShare(sh);
          }}
        />
      )}

      {share && <ShareDialog share={share} onClose={() => setShare(null)} />}
    </div>
  );
}

function HandoverCard({ h, onDone, onShare }: { h: Handover; onDone: (m: string) => void; onShare: (s: ShareLink) => void }) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = !h.returned_at;

  async function scan(files: FileList | null, stage: 'OUT' | 'IN') {
    if (!files?.length) return;
    setBusy(true);
    const failed = await uploadDocsOneByOne(h.id, stage, Array.from(files));
    setBusy(false);
    onDone(failed ? `⚠️ ${failed} מסמכים לא נשמרו` : 'המסמכים נשמרו ✓');
    router.refresh();
  }

  return (
    <div className={`rounded-xl border bg-white p-3 space-y-2 ${open && days(h.given_at, null) >= 14 ? 'border-amber-300' : 'border-gray-200'}`}>
      <Fields>
        <F label="רכב חליפי" tone="text-gray-900 font-bold">
          {h.loaner_plate}
          {h.loaner_type ? ` · ${h.loaner_type}` : ''}
        </F>
        <F label="לקוח">{h.customer_name || '—'}</F>
        {h.customer_phone && <F label="טלפון">{h.customer_phone}</F>}
        {h.customer_car_model && <F label="דגם רכב הלקוח">{h.customer_car_model}</F>}
        <F label="רכב הלקוח">
          {h.case_id ? (
            <Link href={`/go/${h.case_id}`} className="text-indigo-700 font-semibold">
              {h.customer_plate || 'לתיק'} ← לתיק
            </Link>
          ) : (
            h.customer_plate || '—'
          )}
        </F>
        {h.branch_name && <F label="סניף">{h.branch_name}</F>}
        <F label="נמסר">{fmt(h.given_at)}</F>
        {(h.km_out != null || h.fuel_out) && <F label="במסירה">{[h.km_out != null ? `${h.km_out.toLocaleString('he-IL')} ק״מ` : null, h.fuel_out ? `דלק ${h.fuel_out}` : null].filter(Boolean).join(' · ')}</F>}
        {h.created_by_name && <F label="מסר/ה">{h.created_by_name}</F>}
        {open ? (
          <F label="אצל הלקוח" tone={days(h.given_at, null) >= 14 ? 'text-amber-700 font-semibold' : undefined}>{days(h.given_at, null)} ימים</F>
        ) : (
          <>
            <F label="הוחזר" tone="text-green-700 font-semibold">{fmt(h.returned_at)}</F>
            {(h.km_in != null || h.fuel_in) && <F label="בהחזרה">{[h.km_in != null ? `${h.km_in.toLocaleString('he-IL')} ק״מ` : null, h.fuel_in ? `דלק ${h.fuel_in}` : null].filter(Boolean).join(' · ')}</F>}
            {h.km_in != null && h.km_out != null && <F label="נסיעה">{(h.km_in - h.km_out).toLocaleString('he-IL')} ק״מ</F>}
            <F label="סה״כ ימים">{days(h.given_at, h.returned_at)}</F>
            {h.returned_by_name && <F label="קיבל/ה">{h.returned_by_name}</F>}
          </>
        )}
        {h.waiver && (
          <F label="ביטול השתתפות עצמית" tone="text-indigo-700 font-semibold">
            כן{h.waiver_from && h.waiver_to ? ` · ${h.waiver_from.split('-').reverse().join('/')}–${h.waiver_to.split('-').reverse().join('/')}` : ''}
          </F>
        )}
        {h.notes && <F label="הערות">{h.notes}</F>}
        {h.return_notes && <F label="הערות החזרה">{h.return_notes}</F>}
      </Fields>

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
        {h.signature_url && (
          <a href={`/loaners/${h.id}/agreement`} target="_blank" rel="noopener" className="px-2.5 py-1 rounded-lg border border-green-200 bg-green-50 text-green-800 text-xs font-semibold">
            ✍️ המסמכים החתומים
          </a>
        )}
        {h.signed_form_url && (
          <button type="button" onClick={() => setView(h.signed_form_url)} className="px-2.5 py-1 rounded-lg border border-green-200 bg-green-50 text-green-800 text-xs font-semibold">
            📄 טופס חתום
          </button>
        )}
        {h.docs.map((d, i) =>
          d.url ? (
            d.mime_type === 'application/pdf' ? (
              <a key={d.id} href={d.url} target="_blank" rel="noopener" className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs">
                📎 מסמך {i + 1}{d.stage === 'IN' ? ' (החזרה)' : ''}
              </a>
            ) : (
              <button key={d.id} type="button" onClick={() => setView(d.url)} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs">
                📎 מסמך {i + 1}{d.stage === 'IN' ? ' (החזרה)' : ''}
              </button>
            )
          ) : null,
        )}
        <label className={`px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-xs font-semibold cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'שומר…' : '📷 סריקת מסמך'}
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={busy} onChange={(e) => void scan(e.target.files, open ? 'OUT' : 'IN')} />
        </label>
        {h.signature_url && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await resendLoanerCopy(h.id);
              setBusy(false);
              if (r.share) onShare(r.share);
              else onDone(`⚠️ ${r.error ?? 'שגיאה'}`);
            }}
            className="px-2.5 py-1 rounded-lg border border-green-300 bg-white text-green-800 text-xs font-semibold"
          >
            📲 עותק ללקוח
          </button>
        )}
        {open && (
          <button type="button" onClick={() => setReturning(true)} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-bold">
            ↩️ החזרת הרכב
          </button>
        )}
      </div>

      {returning && (
        <ReturnDialog
          h={h}
          onClose={() => setReturning(false)}
          onSaved={(m, sh) => {
            setReturning(false);
            onDone(m);
            if (sh) onShare(sh);
          }}
        />
      )}
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="מסמך" className="max-w-full max-h-full rounded-lg bg-white" />
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-4 space-y-3 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 text-xl" aria-label="סגור">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const input = 'w-full h-11 px-3 rounded-lg border border-gray-300 text-sm bg-white';
const lab = 'block text-xs text-gray-500 mb-0.5';

function GiveDialog({ fleet, branches, onClose, onSaved }: { fleet: FleetCar[]; branches: { id: string; name: string }[]; onClose: () => void; onSaved: (m: string, share?: ShareLink) => void }) {
  const router = useRouter();
  const [fleetId, setFleetId] = useState<string>('');
  const [manualPlate, setManualPlate] = useState('');
  const [manualType, setManualType] = useState('');
  const [custPlate, setCustPlate] = useState('');
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof findCaseForLoaner>>['matches'] | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [givenAt, setGivenAt] = useState(nowLocal());
  const [kmOut, setKmOut] = useState('');
  const [fuelOut, setFuelOut] = useState('');
  const [notes, setNotes] = useState('');
  const [signMode, setSignMode] = useState<'screen' | 'paper'>('screen');
  const [signature, setSignature] = useState<string | null>(null);
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Driver's declaration (Amit, 14/10)
  const [dName, setDName] = useState('');
  const [dId, setDId] = useState('');
  const [dLicense, setDLicense] = useState('');
  const [dAddress, setDAddress] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [carModel, setCarModel] = useState('');
  // ביטול השתתפות עצמית (optional; 75 ₪ + VAT a day, max 525 ₪ + VAT)
  const [waiver, setWaiver] = useState(false);
  const [waiverFrom, setWaiverFrom] = useState(nowLocal().slice(0, 10));
  const [waiverTo, setWaiverTo] = useState('');
  const [driverOk, setDriverOk] = useState(false);
  const wCost = waiver ? waiverCost(waiverFrom, waiverTo) : null;

  const car = fleet.find((f) => f.id === fleetId);
  const loanerPlate = car?.plate ?? manualPlate.replace(/\D/g, '');
  const loanerType = car?.car_type ?? manualType;
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;
  const docsText = loanerDocuments({
    branchName,
    customerName: name || null,
    customerPlate: custPlate.replace(/\D/g, '') || null,
    loanerPlate: loanerPlate || '__________',
    loanerType: loanerType || null,
    givenAt: givenAt ? new Date(givenAt).toISOString() : new Date().toISOString(),
    kmOut: kmOut ? Number(kmOut.replace(/\D/g, '')) : null,
    fuelOut: fuelOut || null,
    driver: { full_name: dName || name, id_number: dId, license_number: dLicense, address: dAddress, phone: dPhone || phone },
    customerCarModel: carModel || null,
    waiver: waiver ? { from: waiverFrom || null, to: waiverTo || null } : null,
  });

  async function findCase() {
    setErr(null);
    const r = await findCaseForLoaner(custPlate);
    if (r.error) return setErr(r.error);
    setMatches(r.matches);
    if (r.matches.length) pickCase(r.matches[0]);
  }
  function pickCase(m: NonNullable<typeof matches>[number]) {
    setCaseId(m.case_id);
    setBranchId(m.branch_id);
    setName((v) => v || m.customer_name || '');
    setPhone((v) => v || m.phone || '');
    setCarModel((v) => v || m.car_model || '');
  }

  async function save() {
    setErr(null);
    if (!loanerPlate) return setErr('נא לבחור רכב חליפי');
    if (!name.trim()) return setErr('נא להזין את שם הלקוח');
    if (!caseId && !branchId) return setErr('נא לבחור סניף');
    if (signMode === 'screen' && (!(dName || name).trim() || dId.replace(/\D/g, '').length < 5 || !dLicense.trim() || !dAddress.trim()))
      return setErr('בהצהרת הנהג חובה: שם מלא, ת.ז., מס׳ רישיון נהיגה וכתובת');
    if (waiver && !wCost) return setErr('בביטול השתתפות עצמית — נא לבחור מתאריך עד תאריך');
    if (!driverOk) return setErr(`נא לאשר שהנהג בן ${MIN_DRIVER_AGE}+ עם רישיון ${MIN_LICENSE_YEARS} שנים לפחות`);
    if (signMode === 'screen' && !signature) return setErr('הלקוח צריך לחתום על המסך');
    if (signMode === 'paper' && !formPhoto) return setErr('נא לצלם את הטופס החתום');
    setBusy(true);
    const fd = new FormData();
    if (fleetId) fd.append('fleet_id', fleetId);
    fd.append('loaner_plate', loanerPlate);
    fd.append('loaner_type', loanerType);
    if (caseId) fd.append('case_id', caseId);
    fd.append('branch_id', branchId);
    fd.append('customer_plate', custPlate);
    fd.append('customer_name', name);
    fd.append('customer_phone', phone);
    fd.append('given_at', new Date(givenAt).toISOString());
    fd.append('km_out', kmOut);
    fd.append('fuel_out', fuelOut);
    fd.append('notes', notes);
    fd.append('driver_name', dName || name);
    fd.append('driver_id', dId);
    fd.append('driver_license', dLicense);
    fd.append('driver_address', dAddress);
    fd.append('driver_phone', dPhone || phone);
    fd.append('customer_car_model', carModel);
    if (waiver) {
      fd.append('waiver', 'yes');
      fd.append('waiver_from', waiverFrom);
      fd.append('waiver_to', waiverTo);
    }
    if (signMode === 'screen' && signature) fd.append('signature', signature);
    if (signMode === 'paper' && formPhoto) fd.append('signed_form', await shrinkImage(formPhoto));
    const r = await createHandover(fd).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'שגיאה' }) as { error: string; id?: string; share?: ShareLink });
    if (!('id' in r) || !r.id) {
      setBusy(false);
      return setErr(r.error ?? 'שגיאה');
    }
    const failed = docs.length ? await uploadDocsOneByOne(r.id, 'OUT', docs) : 0;
    setBusy(false);
    router.refresh();
    onSaved(failed ? `הרכב נמסר ✓ — אבל ${failed} מסמכים לא נשמרו (אפשר לסרוק שוב מהכרטיס)` : `הרכב ${loanerPlate} נמסר ל${name} ✓`, r.share);
  }

  return (
    <Modal title="🚗 מסירת רכב חליפי" onClose={onClose}>
      <section className="space-y-2">
        <p className="font-semibold text-sm">1. איזה רכב חליפי</p>
        {fleet.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fleet.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFleetId(fleetId === f.id ? '' : f.id)}
                className={`px-3 py-2 rounded-xl border-2 text-sm text-right ${fleetId === f.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}
              >
                <b>{f.plate}</b> · {f.car_type}
              </button>
            ))}
          </div>
        )}
        {!fleetId && (
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={lab}>{fleet.length ? 'או מספר רכב חליפי שלא ברשימה' : 'מספר רכב חליפי'}</span>
              <input value={manualPlate} onChange={(e) => setManualPlate(e.target.value)} inputMode="numeric" className={input} dir="ltr" />
            </label>
            <label>
              <span className={lab}>סוג רכב</span>
              <input value={manualType} onChange={(e) => setManualType(e.target.value)} placeholder="למשל: טויוטה קורולה" className={input} />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <p className="font-semibold text-sm">2. הלקוח והתיק</p>
        <div className="flex gap-2">
          <input value={custPlate} onChange={(e) => setCustPlate(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void findCase()} placeholder="מספר רכב של הלקוח (בתיקון)" inputMode="numeric" className={input} dir="ltr" />
          <button type="button" onClick={() => void findCase()} disabled={!custPlate.trim()} className="h-11 px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-40">
            מצא תיק
          </button>
        </div>
        {matches && matches.length === 0 && <p className="text-xs text-amber-700">לא נמצא תיק לרכב הזה — ממלאים ידנית (אפשר לשייך לתיק גם אחר כך).</p>}
        {matches && matches.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {matches.map((m) => (
              <button key={m.case_id} type="button" onClick={() => pickCase(m)} className={`px-2.5 py-1 rounded-lg border text-xs ${caseId === m.case_id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
                {m.case_key ?? 'תיק'} · {m.customer_name ?? ''} · {m.branch_name ?? ''}
                {m.closed ? ' (סגור)' : ''}
              </button>
            ))}
          </div>
        )}
        {caseId && <p className="text-xs text-green-700">✓ משויך לתיק</p>}
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={lab}>שם הלקוח</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
          <label>
            <span className={lab}>טלפון נייד (לשליחת עותק בוואטסאפ)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={input} dir="ltr" />
          </label>
          <label>
            <span className={lab}>דגם רכב הלקוח</span>
            <input value={carModel} onChange={(e) => setCarModel(e.target.value)} className={input} />
          </label>
          {!caseId && branches.length > 1 && (
            <label>
              <span className={lab}>סניף</span>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={input}>
                <option value="">בחרו…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <p className="font-semibold text-sm">3. המסירה</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <label>
            <span className={lab}>תאריך ושעת מסירה</span>
            <input type="datetime-local" value={givenAt} onChange={(e) => setGivenAt(e.target.value)} className={input} />
          </label>
          <label>
            <span className={lab}>ק״מ במסירה (רשות)</span>
            <input value={kmOut} onChange={(e) => setKmOut(e.target.value)} inputMode="numeric" className={input} dir="ltr" />
          </label>
          <label>
            <span className={lab}>דלק במסירה (רשות)</span>
            <select value={fuelOut} onChange={(e) => setFuelOut(e.target.value)} className={input}>
              <option value="">—</option>
              {FUEL_LEVELS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span className={lab}>הערות (שריטות קיימות, ציוד ברכב וכו׳)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={lab}>סריקת מסמכים (רישיון נהיגה של הלקוח, צילומי הרכב וכו׳) — אפשר כמה</span>
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setDocs(Array.from(e.target.files ?? []))} className="text-sm" />
          {docs.length > 0 && <span className="text-xs text-green-700"> {docs.length} מסמכים נבחרו</span>}
        </label>
      </section>

      <section className="space-y-2">
        <p className="font-semibold text-sm">ביטול השתתפות עצמית (רשות)</p>
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" onClick={() => setWaiver(v)} className={`h-10 px-4 rounded-lg border text-sm font-semibold ${waiver === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}>
              {v ? 'כן' : 'לא'}
            </button>
          ))}
        </div>
        {waiver && (
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={lab}>מיום</span>
              <input type="date" value={waiverFrom} onChange={(e) => setWaiverFrom(e.target.value)} className={input} />
            </label>
            <label>
              <span className={lab}>עד יום</span>
              <input type="date" value={waiverTo} onChange={(e) => setWaiverTo(e.target.value)} className={input} />
            </label>
            <p className="col-span-2 text-sm text-indigo-800">
              {wCost
                ? `סה״כ ${wCost.days} ימים · ${wCost.beforeVat.toLocaleString('he-IL')} ₪ + מע״מ (${wCost.withVat.toLocaleString('he-IL')} ₪ כולל מע״מ)`
                : `${WAIVER_PER_DAY_ILS} ₪ + מע״מ ליום, עד ${WAIVER_MAX_ILS} ₪ + מע״מ`}
            </p>
          </div>
        )}
      </section>

      <label className="flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 cursor-pointer">
        <input type="checkbox" checked={driverOk} onChange={(e) => setDriverOk(e.target.checked)} className="w-5 h-5 mt-0.5 shrink-0" />
        <span className="text-sm font-semibold text-amber-900">
          בדקתי: הנהג בן {MIN_DRIVER_AGE} לפחות, עם רישיון נהיגה {MIN_LICENSE_YEARS} שנים לפחות (לא נהג צעיר / חדש)
        </span>
      </label>

      <section className="space-y-2">
        <p className="font-semibold text-sm">4. חתימת הלקוח</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSignMode('screen')} className={`flex-1 h-10 rounded-lg border text-sm font-semibold ${signMode === 'screen' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}>
            ✍️ חתימה על המסך
          </button>
          <button type="button" onClick={() => setSignMode('paper')} className={`flex-1 h-10 rounded-lg border text-sm font-semibold ${signMode === 'paper' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}>
            📷 צילום טופס חתום
          </button>
        </div>
        {signMode === 'screen' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
              <p className="text-sm font-semibold">פרטי הנהג להצהרה (לצורך הסבת דו״חות)</p>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className={lab}>שם מלא *</span>
                  <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder={name} className={input} />
                </label>
                <label>
                  <span className={lab}>ת.ז. *</span>
                  <input value={dId} onChange={(e) => setDId(e.target.value)} inputMode="numeric" className={input} dir="ltr" />
                </label>
                <label>
                  <span className={lab}>מס׳ רישיון נהיגה *</span>
                  <input value={dLicense} onChange={(e) => setDLicense(e.target.value)} className={input} dir="ltr" />
                </label>
                <label>
                  <span className={lab}>טלפון</span>
                  <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} placeholder={phone} inputMode="tel" className={input} dir="ltr" />
                </label>
              </div>
              <label>
                <span className={lab}>כתובת מלאה *</span>
                <input value={dAddress} onChange={(e) => setDAddress(e.target.value)} className={input} />
              </label>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3 text-sm leading-6">
              {[docsText.agreement, docsText.declaration, ...(docsText.waiver ? [docsText.waiver] : [])].map((d) => (
                <div key={d.title} className="space-y-1">
                  <p className="font-bold text-center">{d.title}</p>
                  <p>{d.intro}</p>
                  <ol className="list-decimal pr-5 space-y-1">
                    {d.clauses.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                </div>
              ))}
              <p className="font-semibold">{docsText.confirmation}</p>
              <p className="text-xs text-gray-500">חתימת הלקוח{(dName || name) ? ` (${dName || name})` : ''}:</p>
              <SignaturePad onChange={setSignature} />
            </div>
          </div>
        ) : (
          <label className="block w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center cursor-pointer">
            <span className="font-semibold">{formPhoto ? '✓ הטופס צולם — לחצו לצילום מחדש' : '📷 צלמו את הטופס שהלקוח חתם עליו'}</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFormPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </section>

      {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      <button type="button" onClick={() => void save()} disabled={busy} className="w-full h-12 rounded-xl bg-red-600 text-white text-base font-bold disabled:opacity-50">
        {busy ? 'שומר…' : 'שמירת המסירה'}
      </button>
    </Modal>
  );
}

function ReturnDialog({ h, onClose, onSaved }: { h: Handover; onClose: () => void; onSaved: (m: string, share?: ShareLink) => void }) {
  const router = useRouter();
  const [at, setAt] = useState(nowLocal());
  const [km, setKm] = useState('');
  const [fuel, setFuel] = useState('');
  const [notes, setNotes] = useState('');
  const [docs, setDocs] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('handover_id', h.id);
    if (signature) fd.append('signature', signature);
    fd.append('returned_at', new Date(at).toISOString());
    fd.append('km_in', km);
    fd.append('fuel_in', fuel);
    fd.append('return_notes', notes);
    const r = await returnHandover(fd).catch(() => ({ error: 'שגיאה' }) as { error: string; share?: ShareLink });
    if ('error' in r && r.error) {
      setBusy(false);
      return setErr(r.error);
    }
    const failed = docs.length ? await uploadDocsOneByOne(h.id, 'IN', docs) : 0;
    setBusy(false);
    router.refresh();
    onSaved(failed ? `הרכב הוחזר ✓ — ${failed} מסמכים לא נשמרו` : `הרכב ${h.loaner_plate} הוחזר ✓`, 'share' in r ? r.share : undefined);
  }

  return (
    <Modal title={`↩️ החזרת רכב ${h.loaner_plate}`} onClose={onClose}>
      <Fields>
        <F label="לקוח">{h.customer_name || '—'}</F>
        <F label="נמסר">{fmt(h.given_at)}</F>
        {h.km_out != null && <F label="ק״מ במסירה">{h.km_out.toLocaleString('he-IL')}</F>}
        {h.fuel_out && <F label="דלק במסירה">{h.fuel_out}</F>}
      </Fields>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <label>
          <span className={lab}>תאריך ושעת החזרה</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} />
        </label>
        <label>
          <span className={lab}>ק״מ בהחזרה (רשות)</span>
          <input value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" className={input} dir="ltr" />
        </label>
        <label>
          <span className={lab}>דלק בהחזרה (רשות)</span>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} className={input}>
            <option value="">—</option>
            {FUEL_LEVELS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className={lab}>הערות (נזק, חוסר דלק, דו״ח וכו׳)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className={lab}>סריקת מסמכים / צילומי הרכב בהחזרה (רשות)</span>
        <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setDocs(Array.from(e.target.files ?? []))} className="text-sm" />
      </label>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">חתימת הלקוח על ההחזרה (מומלץ):</p>
        <SignaturePad onChange={setSignature} height={140} />
      </div>
      {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      <button type="button" onClick={() => void save()} disabled={busy} className="w-full h-12 rounded-xl bg-gray-900 text-white text-base font-bold disabled:opacity-50">
        {busy ? 'שומר…' : 'אישור החזרה'}
      </button>
    </Modal>
  );
}

function FleetTab({ fleet, branches, handovers, onDone }: { fleet: FleetCar[]; branches: { id: string; name: string }[]; handovers: Handover[]; onDone: (m: string) => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<FleetCar> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErr(null);
    const r = await saveFleetCar({ id: edit.id, plate: edit.plate ?? '', car_type: edit.car_type ?? '', branch_id: edit.branch_id ?? null, notes: edit.notes ?? null, active: edit.active ?? true });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setEdit(null);
    onDone('נשמר ✓');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEdit({ active: true })} className="h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-bold">
        + הוספת רכב לצי
      </button>
      {fleet.length === 0 && <p className="text-gray-400 py-6 text-center">עוד לא הוזנו רכבים חליפיים. אפשר להוסיף כאן, או לשלוח רשימה ונזין אותה.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {fleet.map((f) => {
          const at = handovers.find((h) => h.fleet_id === f.id);
          return (
            <div key={f.id} className={`rounded-xl border p-3 bg-white ${f.active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
              <Fields>
                <F label="מספר רכב" tone="text-gray-900 font-bold">{f.plate}</F>
                <F label="סוג רכב">{f.car_type}</F>
                {f.branch_name && <F label="סניף">{f.branch_name}</F>}
                <F label="מצב" tone={at ? 'text-amber-700 font-semibold' : f.active ? 'text-green-700 font-semibold' : 'text-gray-500'}>
                  {at ? `אצל ${at.customer_name ?? 'לקוח'} מ-${fmt(at.given_at)}` : f.active ? 'פנוי' : 'לא פעיל'}
                </F>
                {f.notes && <F label="הערות">{f.notes}</F>}
              </Fields>
              <button type="button" onClick={() => setEdit(f)} className="mt-2 px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                עריכה
              </button>
            </div>
          );
        })}
      </div>
      {edit && (
        <Modal title={edit.id ? `עריכת רכב ${edit.plate}` : 'הוספת רכב לצי'} onClose={() => setEdit(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={lab}>מספר רכב</span>
              <input value={edit.plate ?? ''} onChange={(e) => setEdit({ ...edit, plate: e.target.value })} inputMode="numeric" className={input} dir="ltr" />
            </label>
            <label>
              <span className={lab}>סוג רכב</span>
              <input value={edit.car_type ?? ''} onChange={(e) => setEdit({ ...edit, car_type: e.target.value })} className={input} />
            </label>
            <label>
              <span className={lab}>סניף (רשות)</span>
              <select value={edit.branch_id ?? ''} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value || null })} className={input}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 mt-5 text-sm">
              <input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="w-4 h-4" />
              פעיל (זמין למסירה)
            </label>
          </div>
          <label>
            <span className={lab}>הערות</span>
            <input value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={input} />
          </label>
          {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
          <button type="button" onClick={() => void save()} disabled={busy} className="w-full h-11 rounded-xl bg-gray-900 text-white font-bold disabled:opacity-50">
            {busy ? 'שומר…' : 'שמור'}
          </button>
        </Modal>
      )}
    </div>
  );
}

/** Send the customer his copy of the signed documents on WhatsApp. */
function ShareDialog({ share, onClose }: { share: ShareLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="📲 עותק ללקוח בוואטסאפ" onClose={onClose}>
      <p className="text-sm text-gray-600">הלקוח מקבל קישור אישי למסמכים שחתם עליהם — כך אין מצב של &quot;לא ידעתי, לא הבנתי&quot;.</p>
      <pre className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-3 font-[inherit]">{share.message}</pre>
      <div className="flex gap-2 flex-wrap">
        {share.whatsapp ? (
          <a href={share.whatsapp} target="_blank" rel="noopener noreferrer" className="h-11 px-5 rounded-xl bg-green-600 text-white font-bold inline-flex items-center">
            📲 שליחה בוואטסאפ
          </a>
        ) : (
          <p className="text-sm text-amber-700">אין מספר נייד תקין — העתיקו את ההודעה ושלחו ידנית.</p>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(share.message);
              setCopied(true);
            } catch {
              /* manual copy */
            }
          }}
          className="h-11 px-4 rounded-xl border border-gray-300 text-sm"
        >
          {copied ? '✓ הועתק' : 'העתקת ההודעה'}
        </button>
        <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl border border-gray-300 text-sm">
          סגירה
        </button>
      </div>
    </Modal>
  );
}
