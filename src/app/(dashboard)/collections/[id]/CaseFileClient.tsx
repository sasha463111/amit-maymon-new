'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateCollectionCase, type CaseUpdate, type CollectionCase } from '@/app/actions/collections';
import { addCaseEvent, finishReminder, uploadCaseFile, type CaseEvent, type CaseEventKind, type CaseFile } from '@/app/actions/collectionFile';
import { daysLate, expectedPayment, payerOf, workingDaysBetween, THIRD_PARTY, type PaymentRule } from '@/lib/collections';
import { CLAIM_TYPES, INSURERS, WORK_SOURCE_LABEL } from '@/lib/finance';
import { formatDate } from '@/lib/dates';
import { shrinkImage } from '@/lib/shrinkImage';
import { STATUS_CHIP, STATUS_LABEL, StatusEditor, ils, isClosed, num, toCollect, today } from '../shared';

// The collection case file (Amit, 2026-10-14). The list is the outer view;
// here — every detail, one value per line with its label (Amit's rule).

type Tab = 'log' | 'claim' | 'appraiser' | 'tp' | 'contacts' | 'docs' | 'status';

const at = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">{children}</dl>;
}
function F({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <>
      <dt className="text-gray-400 whitespace-nowrap">{label}:</dt>
      <dd className={`min-w-0 break-words ${tone ?? 'text-gray-900'}`}>{children ?? '—'}</dd>
    </>
  );
}

export function CaseFileClient({
  c,
  events,
  files,
  repairCaseId,
  terms,
  supervisor,
}: {
  c: CollectionCase;
  events: CaseEvent[];
  files: CaseFile[];
  repairCaseId: string | null;
  terms: Record<string, PaymentRule>;
  supervisor: boolean;
}) {
  const [tab, setTab] = useState<Tab>('log');
  const t0 = today();
  const exp = expectedPayment(c, terms);
  const late = !isClosed(c) && c.status !== 'LEGAL' && c.status !== 'BLOCKED' && !!exp.date && exp.date < t0;
  const openReminders = events.filter((e) => e.remind_at && !e.remind_done_at);

  // A push opens /collections/<id>#r-<reminder>: land on the log.
  useEffect(() => {
    if (window.location.hash.startsWith('#r-')) setTab('log');
  }, []);

  const tabs: [Tab, string][] = [
    ['log', `טיפול שוטף${openReminders.length ? ` (⏰ ${openReminders.length})` : ''}`],
    ['claim', 'פרטי תביעה'],
    ['appraiser', 'שמאי וסכומים'],
    ['tp', 'צד ג׳'],
    ['contacts', 'אנשי קשר'],
    ['docs', `מסמכים (${files.length})`],
    ['status', 'סטטוס ותשלום'],
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4" dir="rtl">
      <Link href="/collections" className="text-sm text-indigo-700 font-semibold">→ כל תיקי הגבייה</Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">תיק גבייה · רכב {c.plate}</h1>
            <p className="text-sm text-gray-500">{c.customer_name ?? ''}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        </div>
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <Fields>
            <F label="משלם">{payerOf(c) || '—'}</F>
            <F label="סוג תביעה">{c.claim_type}</F>
            <F label="מספר תביעה">{c.claim_number}</F>
            <F label="מצב תביעה" tone="text-indigo-700 font-semibold">{c.claim_stage}</F>
            <F label="מסלקת">{c.assigned_name}</F>
          </Fields>
          <Fields>
            <F label="לגבייה" tone="text-gray-900 font-bold">{ils(toCollect(c))}</F>
            <F label="צפי כניסת כסף" tone={late ? 'text-red-700 font-semibold' : undefined}>
              {isClosed(c) && c.received_on ? `שולם ${formatDate(c.received_on)}` : exp.date ? `${formatDate(exp.date)}${late ? ` · ⏰ איחור ${daysLate(exp.date, t0)} ימים` : ''}` : exp.basis}
            </F>
            <F label="נפתח">{formatDate(c.opened_at)}</F>
            <F label="ימי עבודה">{workingDaysBetween(c.opened_at, c.closed_at ?? t0)}</F>
            {repairCaseId && supervisor && (
              <F label="תיק התיקון">
                <Link href={`/go/${repairCaseId}`} className="text-indigo-700 font-semibold">פתיחה ←</Link>
              </F>
            )}
          </Fields>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {tabs.map(([k, label]) => (
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

      {tab === 'log' && <LogTab c={c} events={events} supervisor={supervisor} />}
      {tab === 'claim' && (
        <DetailsTab
          c={c}
          title="פרטי תביעה"
          fields={[
            { k: 'claim_number', label: 'מספר תביעה בחברה', type: 'text', ltr: true },
            { k: 'claim_stage', label: 'מצב תביעה', type: 'text', list: 'stages' },
            { k: 'work_source', label: 'מקור עבודה', type: 'select', options: Object.entries(WORK_SOURCE_LABEL) },
            { k: 'insurer', label: 'חברת ביטוח', type: 'text', list: 'insurers' },
            { k: 'claim_type', label: 'סוג תביעה', type: 'select', options: CLAIM_TYPES.map((x) => [x, x] as [string, string]) },
            { k: 'event_date', label: 'תאריך האירוע', type: 'date' },
            { k: 'customer_name', label: 'שם הלקוח', type: 'text' },
            { k: 'customer_phone', label: 'טלפון הלקוח', type: 'tel' },
            { k: 'invoice_number', label: 'מספר חשבונית', type: 'text', ltr: true },
            { k: 'case_closed_on', label: 'תאריך סגירת התיק', type: 'date' },
            { k: 'legal_claim_number', label: 'מספר תביעה משפטית', type: 'text', ltr: true },
          ]}
        />
      )}
      {tab === 'appraiser' && (
        <DetailsTab
          c={c}
          title="שמאי וסכומים"
          fields={[
            { k: 'appraiser_name', label: 'שם השמאי', type: 'text' },
            { k: 'appraiser_damage', label: 'נזק לפי שמאי', type: 'money' },
            { k: 'appraiser_fee', label: 'שכ״ט שמאי', type: 'money' },
            { k: 'depreciation', label: 'ירידת ערך', type: 'money' },
            { k: 'deductible', label: 'השתתפות עצמית', type: 'money' },
            { k: 'salvage_value', label: 'ערך ניצולת', type: 'money' },
            { k: 'extra_expenses', label: 'הוצאות נוספות', type: 'money' },
            { k: 'amount_due', label: 'סכום חשבונית לתשלום', type: 'money' },
            { k: 'vat_offset', label: 'קיזוז מע״מ', type: 'money' },
            { k: 'reinstatement', label: 'כינון', type: 'money' },
            { k: 'claimed_amount', label: 'סכום שנתבע', type: 'money' },
            { k: 'approved_amount', label: 'סכום שאושר', type: 'money' },
          ]}
        />
      )}
      {tab === 'tp' && (
        <DetailsTab
          c={c}
          title="צד ג׳"
          note={c.claim_type !== THIRD_PARTY ? 'התיק לא מסומן כ"צד ג׳" — ממלאים רק אם רלוונטי.' : undefined}
          fields={[
            { k: 'tp_plate', label: 'מספר רכב צד ג׳', type: 'text', ltr: true },
            { k: 'tp_insurer', label: 'חברת הביטוח של צד ג׳', type: 'text', list: 'insurers' },
            { k: 'tp_claim_number', label: 'מספר תביעה אצל צד ג׳', type: 'text', ltr: true },
            { k: 'tp_owner_name', label: 'שם בעל הרכב / הנהג', type: 'text' },
            { k: 'tp_owner_phone', label: 'טלפון', type: 'tel' },
            { k: 'claim_check_due_date', label: 'מועד פירעון צ׳ק תביעות', type: 'date' },
            { k: 'claim_check_amount', label: 'סכום צ׳ק תביעות', type: 'money' },
          ]}
        />
      )}
      {tab === 'contacts' && (
        <DetailsTab
          c={c}
          title="אנשי קשר"
          fields={[
            { k: 'insurer_handler', label: 'מטפל/ת בחברת הביטוח', type: 'text' },
            { k: 'insurer_handler_phone', label: 'טלפון המטפל/ת', type: 'tel' },
            { k: 'insurer_handler_email', label: 'מייל המטפל/ת', type: 'email' },
            { k: 'appraiser_name', label: 'שם השמאי', type: 'text' },
            { k: 'appraiser_phone', label: 'טלפון השמאי', type: 'tel' },
            { k: 'appraiser_email', label: 'מייל השמאי', type: 'email' },
            { k: 'customer_phone', label: 'טלפון הלקוח', type: 'tel' },
          ]}
        />
      )}
      {tab === 'docs' && <DocsTab c={c} files={files} />}
      {tab === 'status' && <StatusTab c={c} />}

      <datalist id="insurers">
        {INSURERS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="stages">
        {['ממתין לדוח שמאי', 'הוגשה דרישת תשלום', 'ממתין לאישור תשלום', 'ממתין לשיק צד ג׳', 'ממתין למסמכים מהלקוח', 'בבירור מול החברה', 'אושר — ממתין לתשלום'].map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </div>
  );
}

// ---- טיפול שוטף -----------------------------------------------------------

const KIND_LABEL: Record<CaseEventKind, string> = { NOTE: '📝 הערה', CALL: '📞 שיחה', EMAIL: '📧 מייל', STATUS: '🔄 סטטוס', DOC: '📎 מסמך', SYSTEM: '⚙️ מערכת' };

function tomorrowNine() {
  const d = new Date(Date.now() + 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function LogTab({ c, events, supervisor }: { c: CollectionCase; events: CaseEvent[]; supervisor: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<CaseEventKind>('NOTE');
  const [body, setBody] = useState('');
  const [remind, setRemind] = useState(false);
  const [rDate, setRDate] = useState(tomorrowNine());
  const [rTime, setRTime] = useState('09:00');
  const [rFor, setRFor] = useState<'me' | 'owner'>('me');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hash, setHash] = useState('');
  useEffect(() => setHash(window.location.hash.slice(1)), []);

  const open = events.filter((e) => e.remind_at && !e.remind_done_at).sort((a, b) => (a.remind_at ?? '').localeCompare(b.remind_at ?? ''));
  const now = new Date().toISOString();

  async function add() {
    setErr(null);
    if (!body.trim()) return setErr(remind ? 'נא לכתוב על מה התזכורת' : 'נא לכתוב מה נעשה');
    let remindAt: string | null = null;
    if (remind) {
      if (!rDate || !rTime) return setErr('נא לבחור תאריך ושעה לתזכורת');
      // Israel local time → ISO (the browser is in Israel; Date parses local time).
      remindAt = new Date(`${rDate}T${rTime}`).toISOString();
    }
    setBusy(true);
    const r = await addCaseEvent(c.id, { kind, body, remind_at: remindAt, remind_for: rFor });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setBody('');
    setRemind(false);
    router.refresh();
  }

  async function done(id: string) {
    setBusy(true);
    const r = await finishReminder(id);
    setBusy(false);
    if (r.error) return setErr(r.error);
    router.refresh();
  }

  const input = 'h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white';
  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="font-bold text-sm text-amber-900">⏰ תזכורות פתוחות</p>
          {open.map((e) => {
            const due = (e.remind_at ?? '') <= now;
            return (
              <div key={e.id} id={`r-${e.id}`} className={`rounded-lg bg-white border p-2 space-y-1 ${hash === `r-${e.id}` ? 'ring-2 ring-amber-500' : 'border-amber-200'}`}>
                <Fields>
                  <F label="מתי" tone={due ? 'text-amber-800 font-bold' : undefined}>{at(e.remind_at)}{due ? ' · הגיע הזמן' : ''}</F>
                  <F label="מה">{e.body}</F>
                  <F label="תזכורת ל">{e.remind_user_name}</F>
                  <F label="נקבעה ע״י">{e.created_by_name}</F>
                </Fields>
                {(e.remind_is_mine || supervisor) && (
                  <button type="button" disabled={busy} onClick={() => void done(e.id)} className="h-9 px-4 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
                    ✓ בוצע
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <p className="font-semibold text-sm">הוספה לטיפול השוטף</p>
        <div className="flex gap-1.5 flex-wrap">
          {(['NOTE', 'CALL', 'EMAIL'] as CaseEventKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`h-9 px-3 rounded-lg border text-sm font-semibold ${kind === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={remind ? 'על מה התזכורת? למשל: לחזור לביטוח ישיר לגבי אישור התשלום' : 'מה נעשה? למשל: דיברתי עם מיכל מהראל, הדוח אצל השמאי'}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
        />
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="w-5 h-5" />
          ⏰ להוסיף תזכורת (תקפוץ בטלפון ובפעמון)
        </label>
        {remind && (
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs text-gray-500">
              תאריך
              <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={`${input} block`} />
            </label>
            <label className="text-xs text-gray-500">
              שעה
              <input type="time" value={rTime} onChange={(e) => setRTime(e.target.value)} className={`${input} block`} />
            </label>
            {supervisor && (
              <label className="text-xs text-gray-500">
                תזכורת ל
                <select value={rFor} onChange={(e) => setRFor(e.target.value as 'me' | 'owner')} className={`${input} block`}>
                  <option value="me">אליי</option>
                  <option value="owner">למסלקת של התיק ({c.assigned_name ?? ''})</option>
                </select>
              </label>
            )}
            <div className="flex gap-1">
              {[
                ['מחר', 1],
                ['בעוד 3 ימים', 3],
                ['בעוד שבוע', 7],
              ].map(([l, d]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setRDate(new Date(Date.now() + Number(d) * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }))}
                  className="h-10 px-3 rounded-lg border border-gray-300 text-xs font-semibold bg-white"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
        <button type="button" onClick={() => void add()} disabled={busy} className="h-11 px-6 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50">
          {busy ? 'שומר…' : remind ? 'שמירה + תזכורת' : 'שמירה'}
        </button>
      </div>

      <div className="space-y-2">
        {events.length === 0 && <p className="text-gray-400 text-center py-6">עוד אין רישומים בתיק</p>}
        {events.map((e) => (
          <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{KIND_LABEL[e.kind]}</span>
              <span>
                {at(e.created_at)} · {e.created_by_name ?? ''}
              </span>
            </div>
            <p className="text-sm text-gray-900 whitespace-pre-wrap mt-1">{e.body}</p>
            {e.remind_at && (
              <p className={`text-xs mt-1 ${e.remind_done_at ? 'text-green-700' : 'text-amber-700'}`}>
                ⏰ תזכורת ל-{at(e.remind_at)} · {e.remind_user_name ?? ''} · {e.remind_done_at ? `בוצע ${at(e.remind_done_at)}` : e.reminded_at ? 'נשלחה, ממתינה לביצוע' : 'מתוזמנת'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- detail tabs ------------------------------------------------------------

type FieldSpec = {
  k: keyof CaseUpdate & keyof CollectionCase;
  label: string;
  type: 'text' | 'money' | 'date' | 'tel' | 'email' | 'select';
  options?: [string, string][];
  list?: string;
  ltr?: boolean;
};

function show(c: CollectionCase, f: FieldSpec): React.ReactNode {
  const v = c[f.k] as string | number | null;
  if (v == null || v === '') return <span className="text-gray-300">—</span>;
  if (f.type === 'money') return ils(Number(v));
  if (f.type === 'date') return formatDate(String(v));
  if (f.type === 'select') return f.options?.find(([k]) => k === v)?.[1] ?? String(v);
  if (f.type === 'tel')
    return (
      <a href={`tel:${String(v).replace(/[^\d+]/g, '')}`} className="text-indigo-700" dir="ltr">
        {String(v)}
      </a>
    );
  if (f.type === 'email')
    return (
      <a href={`mailto:${String(v)}`} className="text-indigo-700" dir="ltr">
        {String(v)}
      </a>
    );
  return String(v);
}

function DetailsTab({ c, title, fields, note }: { c: CollectionCase; title: string; fields: FieldSpec[]; note?: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const init = () => Object.fromEntries(fields.map((f) => [f.k, c[f.k] == null ? '' : String(c[f.k])])) as Record<string, string>;
  const [v, setV] = useState<Record<string, string>>(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = v[f.k] ?? '';
      if (f.type === 'money') {
        const n = num(raw);
        if (n != null && (!Number.isFinite(n) || n < 0)) {
          setBusy(false);
          return setErr(`${f.label}: סכום לא תקין`);
        }
        patch[f.k] = n;
      } else patch[f.k] = raw.trim() || null;
    }
    if ('work_source' in patch && !patch.work_source) delete patch.work_source;
    const r = await updateCollectionCase(c.id, patch as CaseUpdate);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setEdit(false);
    router.refresh();
  }

  const input = 'w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        {!edit && (
          <button
            type="button"
            onClick={() => {
              setV(init());
              setEdit(true);
            }}
            className="h-9 px-4 rounded-lg border border-gray-300 text-sm font-semibold"
          >
            ✏️ עריכה
          </button>
        )}
      </div>
      {note && <p className="text-xs text-amber-700">{note}</p>}
      {!edit ? (
        <Fields>
          {fields.map((f) => (
            <F key={f.k} label={f.label}>
              {show(c, f)}
            </F>
          ))}
        </Fields>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            {fields.map((f) => (
              <label key={f.k} className="block">
                <span className="block text-xs text-gray-500 mb-0.5">{f.label}</span>
                {f.type === 'select' ? (
                  <select value={v[f.k] ?? ''} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} className={input}>
                    <option value="">—</option>
                    {f.options?.map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                    inputMode={f.type === 'money' ? 'decimal' : f.type === 'tel' ? 'tel' : undefined}
                    list={f.list}
                    value={v[f.k] ?? ''}
                    onChange={(e) => setV({ ...v, [f.k]: e.target.value })}
                    className={input}
                    dir={f.ltr || f.type === 'money' || f.type === 'tel' || f.type === 'email' ? 'ltr' : undefined}
                  />
                )}
              </label>
            ))}
          </div>
          {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={busy} className="h-10 px-5 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-50">
              {busy ? 'שומר…' : 'שמירה'}
            </button>
            <button type="button" onClick={() => setEdit(false)} className="h-10 px-4 rounded-lg border border-gray-300 text-sm">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- documents ---------------------------------------------------------------

const DOC_LABELS = ['דוח שמאי', 'חשבונית', 'צ׳ק / קבלה', 'מייל / תכתובת', 'דרישת תשלום', 'ת״ז / רישיון', 'תמונות', 'אחר'];

function DocsTab({ c, files }: { c: CollectionCase; files: CaseFile[] }) {
  const router = useRouter();
  const [label, setLabel] = useState(DOC_LABELS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const own = files.filter((f) => f.source === 'CASE');
  const repair = files.filter((f) => f.source === 'REPAIR');

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMsg(null);
    let failed = 0;
    let lastErr = '';
    for (const f of Array.from(list)) {
      const fd = new FormData();
      fd.append('case_id', c.id);
      fd.append('label', label);
      fd.append('file', f.type.startsWith('image/') ? await shrinkImage(f) : f);
      const r = await uploadCaseFile(fd).catch(() => ({ error: 'שגיאת רשת' }));
      if ('error' in r && r.error) {
        failed++;
        lastErr = r.error;
      }
    }
    setBusy(false);
    setMsg(failed ? `⚠️ ${failed} קבצים לא נשמרו — ${lastErr}` : '✓ נשמר');
    router.refresh();
  }

  const List = ({ items }: { items: CaseFile[] }) => (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((f) => (
        <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-200 bg-white p-2 block hover:bg-gray-50">
          <Fields>
            <F label="סוג">{f.label ?? 'מסמך'}</F>
            <F label="קובץ" tone="text-indigo-700">{f.name}</F>
            <F label="הועלה">{at(f.at)}{f.by ? ` · ${f.by}` : ''}</F>
          </Fields>
        </a>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <p className="font-semibold text-sm">העלאת מסמך / מייל לתיק</p>
        <div className="flex gap-1.5 flex-wrap">
          {DOC_LABELS.map((l) => (
            <button key={l} type="button" onClick={() => setLabel(l)} className={`h-8 px-3 rounded-lg border text-xs font-semibold ${label === l ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
        <label className={`inline-flex items-center h-11 px-5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'מעלה…' : `📎 בחירת קבצים (${label})`}
          <input type="file" multiple accept="image/*,application/pdf,.eml,.msg" className="hidden" disabled={busy} onChange={(e) => void upload(e.target.files)} />
        </label>
        <p className="text-xs text-gray-500">מייל: שומרים אותו מ-Outlook (שמירה בשם / הדפסה ל-PDF) ומעלים כאן. תמונה, PDF או קובץ מייל, עד 4MB לקובץ.</p>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-sm">מסמכי תיק הגבייה ({own.length})</p>
        {own.length ? <List items={own} /> : <p className="text-sm text-gray-400">עוד לא הועלו מסמכים</p>}
      </div>
      {repair.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-sm">מתיק התיקון ({repair.length}) — הועלו כבר במוסך, אין צורך להעלות שוב</p>
          <List items={repair} />
        </div>
      )}
    </div>
  );
}

// ---- status & payment ----------------------------------------------------------

function StatusTab({ c }: { c: CollectionCase }) {
  const [edit, setEdit] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">סטטוס ותשלום</h2>
        {!edit && (
          <button type="button" onClick={() => setEdit(true)} className="h-9 px-4 rounded-lg border border-gray-300 text-sm font-semibold">
            ✏️ עדכון סטטוס / תשלום
          </button>
        )}
      </div>
      {edit ? (
        <StatusEditor c={c} onClose={() => setEdit(false)} />
      ) : (
        <Fields>
          <F label="סטטוס">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          </F>
          <F label="תאריך אישור תשלום">{c.payment_approved_on ? formatDate(c.payment_approved_on) : null}</F>
          <F label="סכום שהתקבל">{c.received_amount != null ? ils(c.received_amount) : null}</F>
          <F label="תאריך תשלום בפועל">{c.received_on ? formatDate(c.received_on) : null}</F>
          <F label="סכום קיזוז">{c.offset_amount != null ? ils(c.offset_amount) : null}</F>
          <F label="סיבת הקיזוז">{c.partial_reason}</F>
          {(c.status === 'LEGAL' || c.legal_sent_on) && (
            <>
              <F label="הועבר למחלקה משפטית">{c.legal_sent_on ? formatDate(c.legal_sent_on) : null}</F>
              <F label="עורך דין">{c.legal_lawyer}</F>
              <F label="סכום התביעה">{c.legal_claim_amount != null ? ils(c.legal_claim_amount) : null}</F>
              <F label="תאריך סיום">{c.legal_closed_on ? formatDate(c.legal_closed_on) : null}</F>
              <F label="שולם בסוף">{c.legal_recovered_amount != null ? ils(c.legal_recovered_amount) : null}</F>
            </>
          )}
          <F label="הערה">{c.note}</F>
        </Fields>
      )}
    </div>
  );
}
