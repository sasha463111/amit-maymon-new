'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Inbox, Send, Search, RefreshCw, Paperclip, LogOut, ArrowRight, Check, PenSquare, Reply, ReplyAll, Forward, Trash2, X, Upload, FolderOpen } from 'lucide-react';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { EmptyState } from '@/components/ui/kit';
import type { AttachTarget, ComposeMode, MailFolder, MailFull, MailListItem, TargetFile } from '@/lib/outlook';

// "📧 דואר" (16/10): the user's own Outlook mailbox inside the app, so nobody
// works in two apps (Tomer: "שהכל יהיה פה"). Read, open attachments, reply /
// reply all / forward / new — with files from the computer, the phone camera
// or straight from the case — delete, and "📎 שייך לתיק" (a copy of the email
// and its files saved with a repair case / claim / referral; suggested by the
// plate numbers in the email). Functions come in as props (server actions in
// the app; sample data in the screenshot harness).

export type MailApi = {
  listMail: (folder: MailFolder, search?: string, next?: string) => Promise<{ items: MailListItem[]; next: string | null; error?: string; reconnect?: boolean }>;
  getMail: (id: string) => Promise<{ mail?: MailFull; suggestions?: AttachTarget[]; error?: string }>;
  searchAttachTargets: (q: string) => Promise<AttachTarget[]>;
  attachMailToTarget: (messageId: string, type: AttachTarget['type'], targetId: string) => Promise<{ ok?: true; error?: string }>;
  disconnectOutlook: () => Promise<{ ok?: true; error?: string }>;
  sendOutlookMail: (fd: FormData) => Promise<{ ok?: true; error?: string }>;
  listTargetFiles: (type: AttachTarget['type'], id: string) => Promise<TargetFile[]>;
  getMailAttachment: (messageId: string, attachmentId: string) => Promise<{ name?: string; contentType?: string; base64?: string; error?: string }>;
  deleteMail: (messageId: string) => Promise<{ ok?: true; error?: string }>;
};
export type MailStatus = { configured: boolean; connected: boolean; email: string | null };

const MAX_MB = 30;
const when = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) === d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return today
    ? d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' });
};
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const TYPE_LABEL: Record<AttachTarget['type'], string> = { CASE: 'תיק תיקון', COLLECTION: 'תביעת ביטוח', REFERRAL: 'הפניה' };
const hrefOf = (t: AttachTarget) => (t.type === 'CASE' ? `/cases/${t.id}` : t.type === 'COLLECTION' ? `/collections/${t.id}` : `/referrals/${t.id}`);

/** The email's own HTML, isolated: no scripts, no forms; links open in a new tab. */
export function MailBody({ html }: { html: string }) {
  const doc = `<!doctype html><html dir="auto"><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1c1917;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return <iframe title="תוכן המייל" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} className="w-full min-h-[360px] h-[60vh] rounded-xl border border-gray-200 bg-white" />;
}

export function MailClient({ status, api, initialError }: { status: MailStatus; api: MailApi; initialError?: string | null }) {
  if (!status.configured) return <NotConfigured />;
  if (!status.connected) return <Connect error={initialError} />;
  return <Mailbox email={status.email ?? ''} api={api} />;
}

function NotConfigured() {
  return (
    <div className="max-w-2xl mx-auto" dir="rtl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
        <h1 className="text-2xl font-extrabold text-gray-900">📧 דואר Outlook במערכת</h1>
        <p className="text-gray-700">הכל מוכן בצד שלנו. כדי להפעיל, מנהל ה-Microsoft 365 של החברה צריך לרשום את המערכת פעם אחת ב-Microsoft Entra ולאשר הרשאות <b>דואר</b> (קריאה ושליחה).</p>
        <p className="text-sm text-gray-600">אחרי ההפעלה כל עובד לוחץ פעם אחת &quot;התחבר עם Microsoft&quot;, ומאותו רגע עובד עם המייל רק מכאן: קורא, עונה, מעביר, מצרף קבצים מהתיק — ו&quot;📎 שייך לתיק&quot;.</p>
      </div>
    </div>
  );
}

function Connect({ error }: { error?: string | null }) {
  return (
    <div className="max-w-xl mx-auto" dir="rtl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 space-y-4 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#0078D4] text-white flex items-center justify-center">
          <Inbox size={28} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">חיבור תיבת הדואר שלך</h1>
        <p className="text-gray-700">כל המייל של Outlook — כאן במערכת: קריאה, תשובה, העברה וצירוף קבצים מהתיק, בלי לעבור בין חלונות.</p>
        <a href="/api/outlook/connect" className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#0078D4] hover:bg-[#106EBE] text-white font-bold">
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
          התחבר עם Microsoft
        </a>
        {error && <p className="text-sm text-red-700">⚠️ {error}</p>}
        <ul className="text-xs text-gray-600 space-y-1 text-start max-w-sm mx-auto">
          <li>✓ מייל יוצא רק כשאת/ה לוחצ/ת &quot;שליחה&quot;</li>
          <li>✓ רק תיבה של toyota-tehila.co.il, ורק שלך</li>
          <li>✓ אפשר לנתק בכל רגע</li>
        </ul>
      </div>
    </div>
  );
}

type ComposeReq = { mode: ComposeMode; mail?: MailFull; suggest?: AttachTarget[] };

function Mailbox({ email, api }: { email: string; api: MailApi }) {
  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MailListItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeReq | null>(null);
  const seq = useRef(0);

  async function load(more = false) {
    const my = ++seq.current;
    setLoading(true);
    setErr(null);
    const r = await api.listMail(folder, q, more ? next ?? undefined : undefined);
    if (my !== seq.current) return;
    setLoading(false);
    if (r.error) return setErr(r.error + (r.reconnect ? ' — לחצו "ניתוק" והתחברו שוב' : ''));
    setItems((cur) => (more ? [...cur, ...r.items] : r.items));
    setNext(r.next);
  }
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, q]);

  return (
    <div className="max-w-7xl mx-auto space-y-3" dir="rtl">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold text-gray-900">📧 דואר</h1>
        <span className="text-sm text-gray-500 truncate">{email}</span>
        <button type="button" onClick={() => setCompose({ mode: 'new' })} className="h-11 px-4 rounded-xl bg-[#0078D4] hover:bg-[#106EBE] text-white text-sm font-bold inline-flex items-center gap-1.5 ms-auto">
          <PenSquare size={16} aria-hidden="true" />
          מייל חדש
        </button>
        <div className="flex rounded-xl border border-gray-300 bg-white p-1" role="group" aria-label="תיקייה">
          {(
            [
              ['inbox', 'דואר נכנס', Inbox],
              ['sentitems', 'נשלח', Send],
            ] as const
          ).map(([f, l, Icon]) => (
            <button key={f} type="button" onClick={() => setFolder(f)} className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 ${folder === f ? 'bg-gray-900 text-white' : 'text-gray-700'}`}>
              <Icon size={15} aria-hidden="true" />
              {l}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} aria-label="רענון" className="w-11 h-11 rounded-xl border border-gray-300 bg-white flex items-center justify-center">
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm('לנתק את תיבת הדואר מהמערכת? (המיילים ששויכו לתיקים נשארים בתיקים)')) return;
            await api.disconnectOutlook();
            window.location.reload();
          }}
          className="h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm text-gray-700 inline-flex items-center gap-1.5"
        >
          <LogOut size={15} aria-hidden="true" />
          ניתוק
        </button>
      </div>

      {compose && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-0 sm:p-6 overflow-y-auto" onClick={() => setCompose(null)}>
          <div className="w-full max-w-2xl bg-white sm:rounded-2xl shadow-2xl p-4 min-h-full sm:min-h-0" onClick={(e) => e.stopPropagation()}>
            <Compose api={api} req={compose} onClose={() => setCompose(null)} onSent={() => folder === 'sentitems' && void load()} />
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section className={`rounded-2xl border border-gray-200 bg-white overflow-hidden ${openId ? 'hidden lg:block' : ''}`}>
          <label className="flex items-center gap-2 px-3 h-12 border-b border-gray-100">
            <Search size={17} className="text-gray-400 shrink-0" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: מספר רכב, שם, חברת ביטוח…" className="flex-1 h-full outline-none text-sm bg-transparent" aria-label="חיפוש במייל" />
          </label>
          {err && <p className="text-sm text-red-700 p-3">⚠️ {err}</p>}
          {!err && !loading && items.length === 0 && <EmptyState title={q ? 'לא נמצאו מיילים' : 'אין מיילים בתיקייה'} hint={q ? 'נסו מילה אחרת או מספר רכב' : undefined} />}
          <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(m.id);
                    setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)));
                  }}
                  className={`w-full text-start px-3 py-2.5 hover:bg-gray-50 ${openId === m.id ? 'bg-blue-50' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    {!m.isRead && <span className="w-2 h-2 rounded-full bg-[#0078D4] shrink-0" aria-label="לא נקרא" />}
                    <span className={`flex-1 truncate text-sm ${m.isRead ? 'text-gray-800' : 'font-bold text-gray-900'}`}>{m.fromName || m.fromEmail}</span>
                    {m.hasAttachments && <Paperclip size={13} className="text-gray-500 shrink-0" aria-label="יש קבצים" />}
                    <span className="text-xs text-gray-500 shrink-0">{when(m.receivedAt)}</span>
                  </span>
                  <span className={`block truncate text-sm ${m.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{m.subject}</span>
                  <span className="block truncate text-xs text-gray-500">{m.preview}</span>
                </button>
              </li>
            ))}
          </ul>
          {next && (
            <button type="button" onClick={() => void load(true)} className="w-full h-11 text-sm text-indigo-700 font-semibold border-t border-gray-100">
              {loading ? 'טוען…' : 'עוד מיילים'}
            </button>
          )}
        </section>

        <section className={`${openId ? '' : 'hidden lg:block'}`}>
          {openId ? (
            <Reader
              key={openId}
              id={openId}
              api={api}
              onBack={() => setOpenId(null)}
              onCompose={setCompose}
              onDeleted={() => {
                setItems((cur) => cur.filter((x) => x.id !== openId));
                setOpenId(null);
              }}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 h-full min-h-[300px] flex items-center justify-center">
              <EmptyState title="בחרו מייל מהרשימה" hint='עונים, מעבירים, מצרפים קבצים מהתיק — ו"📎 שייך לתיק" שומר אותו בתיק' />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Reader({ id, api, onBack, onCompose, onDeleted }: { id: string; api: MailApi; onBack: () => void; onCompose: (r: ComposeReq) => void; onDeleted: () => void }) {
  const [mail, setMail] = useState<MailFull | null>(null);
  const [suggest, setSuggest] = useState<AttachTarget[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getMail(id).then((r) => {
      if (!alive) return;
      if (r.error || !r.mail) return setErr(r.error ?? 'המייל לא נמצא');
      setMail(r.mail);
      setSuggest(r.suggestions ?? []);
      setAttaching((r.suggestions ?? []).length > 0);
    });
    return () => {
      alive = false;
    };
  }, [id, api]);

  async function openAttachment(attId: string) {
    setOpening(attId);
    const r = await api.getMailAttachment(id, attId);
    setOpening(null);
    if (!r.base64) return setErr(r.error ?? 'הקובץ לא נפתח');
    const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    // PDFs and images open in a new tab; everything else downloads.
    if (/^(application\/pdf|image\/)/.test(r.contentType ?? '')) a.target = '_blank';
    else a.download = r.name ?? 'file';
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (err && !mail) return <p className="text-sm text-red-700 p-4 bg-white rounded-2xl border border-gray-200">⚠️ {err}</p>;
  if (!mail) return <div className="rounded-2xl border border-gray-200 bg-white h-64 animate-pulse" />;
  const btn = 'h-11 px-3 rounded-xl border-2 border-gray-200 bg-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-gray-50';
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <button type="button" onClick={onBack} className="lg:hidden h-10 inline-flex items-center gap-1 text-sm text-indigo-700 font-semibold">
        <ArrowRight size={16} aria-hidden="true" />
        חזרה לרשימה
      </button>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-gray-900">{mail.subject}</h2>
        <p className="text-sm text-gray-700">
          <b>{mail.fromName}</b> <span className="text-gray-500" dir="ltr">&lt;{mail.fromEmail}&gt;</span>
        </p>
        <p className="text-xs text-gray-500">
          אל: {mail.to}
          {mail.cc ? ` · עותק: ${mail.cc}` : ''} · {new Date(mail.receivedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => onCompose({ mode: 'reply', mail, suggest })} className={btn}><Reply size={16} aria-hidden="true" />השב</button>
        <button type="button" onClick={() => onCompose({ mode: 'replyAll', mail, suggest })} className={btn}><ReplyAll size={16} aria-hidden="true" />השב לכולם</button>
        <button type="button" onClick={() => onCompose({ mode: 'forward', mail, suggest })} className={btn}><Forward size={16} aria-hidden="true" />העבר</button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm('למחוק את המייל? (עובר ל"פריטים שנמחקו" ב-Outlook)')) return;
            const r = await api.deleteMail(id);
            if (r.error) setErr(r.error);
            else onDeleted();
          }}
          className={btn}
          aria-label="מחיקה"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setAttaching((v) => !v)} className="h-11 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold inline-flex items-center gap-2 ms-auto">
          📎 שייך לתיק
        </button>
      </div>
      {mail.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mail.attachments.map((a) => (
            <button key={a.id} type="button" onClick={() => void openAttachment(a.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 px-2.5 py-1.5 text-xs text-indigo-700 font-semibold">
              <Paperclip size={12} aria-hidden="true" />
              {opening === a.id ? 'פותח…' : a.name} <span className="text-gray-500 font-normal">· {kb(a.size)}</span>
            </button>
          ))}
        </div>
      )}
      {err && <p className="text-sm text-red-700">⚠️ {err}</p>}
      {attaching && <AttachPanel mail={mail} suggest={suggest} api={api} />}
      <MailBody html={mail.bodyHtml} />
    </article>
  );
}

function AttachPanel({ mail, suggest, api }: { mail: MailFull; suggest: AttachTarget[]; api: MailApi }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<AttachTarget[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<AttachTarget | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return setFound(null);
    const t = setTimeout(() => void api.searchAttachTargets(q).then(setFound), 300);
    return () => clearTimeout(t);
  }, [q, api]);

  async function attach(t: AttachTarget) {
    setBusy(t.id);
    setErr(null);
    const r = await api.attachMailToTarget(mail.id, t.type, t.id);
    setBusy(null);
    if (r.error) return setErr(r.error);
    setDone(t);
  }

  if (done)
    return (
      <div className="rounded-xl border border-green-300 bg-green-50 p-3 flex items-center gap-2 text-sm" role="status">
        <Check size={18} className="text-green-700" aria-hidden="true" />
        <span className="flex-1 text-green-900">
          נשמר ב{TYPE_LABEL[done.type]} — {done.label.split(' · ')[1] ?? done.label}
          {mail.attachments.length ? ` (כולל ${mail.attachments.length} קבצים)` : ''}
        </span>
        <Link href={hrefOf(done)} className="font-semibold text-green-900 underline">לתיק ←</Link>
      </div>
    );

  const list = found ?? suggest;
  return (
    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 space-y-2">
      <p className="text-sm font-bold text-amber-900">{found ? 'תוצאות חיפוש' : suggest.length ? '💡 הצעות לפי מספר הרכב שבמייל' : 'לאיזה תיק לשייך?'}</p>
      <ul className="space-y-1.5">
        {list.map((t) => (
          <li key={`${t.type}-${t.id}`} className="flex items-center gap-2 rounded-lg bg-white border border-amber-100 px-2.5 py-2">
            {t.plate && <LicensePlate plate={t.plate} size="sm" className="shrink-0" />}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-gray-900 truncate">{t.label}</span>
              {t.sub && <span className="block text-xs text-gray-600 truncate">{t.sub}</span>}
            </span>
            <button type="button" disabled={!!busy} onClick={() => void attach(t)} className="h-10 px-3 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50 shrink-0">
              {busy === t.id ? 'שומר…' : 'שייך'}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-amber-900">לא נמצא תיק עם מספר הרכב שבמייל — חפשו למטה.</li>}
      </ul>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש תיק אחר: מספר רכב, שם לקוח, מספר תביעה" className="w-full h-11 px-3 rounded-lg border border-amber-200 bg-white text-sm" aria-label="חיפוש תיק" />
      {err && <p className="text-sm text-red-700">⚠️ {err}</p>}
    </div>
  );
}

type Picked = { key: string; name: string; size: number } & ({ kind: 'device'; file: File } | { kind: 'case'; type: AttachTarget['type']; targetId: string; src: TargetFile['src']; id: string });

/** New / reply / reply all / forward — sent from the user's own mailbox, with files from the device or the case. */
function Compose({ api, req, onClose, onSent }: { api: MailApi; req: ComposeReq; onClose: () => void; onSent: () => void }) {
  const { mode, mail, suggest = [] } = req;
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [saveTo, setSaveTo] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const field = 'w-full h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm';
  const totalMb = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
  const title = mode === 'new' ? 'מייל חדש' : mode === 'forward' ? `העברה: ${mail?.subject ?? ''}` : `${mode === 'replyAll' ? 'תשובה לכולם' : 'תשובה'} ל${mail?.fromName || mail?.fromEmail || ''}`;

  function addDevice(list: FileList | null) {
    if (!list) return;
    const add = Array.from(list).map((f): Picked => ({ key: `d-${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, kind: 'device', file: f }));
    setFiles((cur) => [...cur, ...add]);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function send() {
    if (totalMb > MAX_MB) return setErr(`הקבצים גדולים מדי (${totalMb.toFixed(1)}MB) — עד ${MAX_MB}MB למייל`);
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('mode', mode);
    if (mail) fd.append('refId', mail.id);
    fd.append('to', to);
    fd.append('cc', cc);
    fd.append('subject', subject);
    fd.append('text', text);
    if (saveTo) fd.append('saveTo', saveTo);
    for (const f of files) if (f.kind === 'device') fd.append('files', f.file);
    const fromCase = files.flatMap((f) => (f.kind === 'case' ? [{ type: f.type, targetId: f.targetId, src: f.src, id: f.id }] : []));
    fd.append('caseFiles', JSON.stringify(fromCase));
    const r = await api.sendOutlookMail(fd);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setSent(true);
    onSent();
  }

  if (sent)
    return (
      <div className="flex items-center gap-2 text-sm py-2" role="status" dir="rtl">
        <Check size={18} className="text-green-700" aria-hidden="true" />
        <span className="flex-1 text-green-900 font-semibold">המייל נשלח ✓ (נמצא גם בפריטים שנשלחו ב-Outlook){saveTo ? ' · נשמר בתיק' : ''}</span>
        <button type="button" onClick={onClose} className="h-10 px-3 rounded-lg border border-gray-300 bg-white">סגירה</button>
      </div>
    );

  return (
    <div className="space-y-2.5" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-gray-900 truncate">{title}</h3>
        <button type="button" onClick={onClose} aria-label="סגירה" className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center shrink-0"><X size={18} /></button>
      </div>
      {(mode === 'reply' || mode === 'replyAll') && mail && (
        <p className="text-xs text-gray-600">נשלח אל <b dir="ltr">{mail.fromEmail}</b>{mode === 'replyAll' ? ' וכל המכותבים' : ''} · נושא: RE: {mail.subject}</p>
      )}
      {(mode === 'new' || mode === 'forward') && (
        <label className="block"><span className="block text-sm font-semibold mb-1">אל</span><input value={to} onChange={(e) => setTo(e.target.value)} className={field} dir="ltr" inputMode="email" placeholder="name@example.com" /></label>
      )}
      {mode === 'new' && <label className="block"><span className="block text-sm font-semibold mb-1">נושא</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} /></label>}
      <label className="block"><span className="block text-sm font-semibold mb-1">עותק <span className="font-normal text-gray-500">(לא חובה)</span></span><input value={cc} onChange={(e) => setCc(e.target.value)} className={field} dir="ltr" inputMode="email" /></label>
      <label className="block">
        <span className="block text-sm font-semibold mb-1">תוכן{mode === 'forward' && mail?.attachments.length ? <span className="font-normal text-gray-500"> · הקבצים של המייל המקורי עוברים איתו</span> : null}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={mode === 'new' ? 7 : 5} className="w-full rounded-xl border border-gray-300 bg-white p-3 text-sm" />
      </label>

      <div className="rounded-xl border border-gray-200 p-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">📎 קבצים</span>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => addDevice(e.target.files)} />
          <button type="button" onClick={() => fileInput.current?.click()} className="h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center gap-1.5"><Upload size={15} aria-hidden="true" />מהמחשב / מצלמה</button>
          <button type="button" onClick={() => setPicker((v) => !v)} className="h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center gap-1.5"><FolderOpen size={15} aria-hidden="true" />מהתיק</button>
          {files.length > 0 && <span className={`text-xs ms-auto ${totalMb > MAX_MB ? 'text-red-700 font-bold' : 'text-gray-500'}`}>{totalMb.toFixed(1)}MB מתוך {MAX_MB}MB</span>}
        </div>
        {picker && (
          <CaseFilePicker
            api={api}
            suggest={suggest}
            chosen={files.map((f) => f.key)}
            onPick={(p) => setFiles((cur) => (cur.some((x) => x.key === p.key) ? cur.filter((x) => x.key !== p.key) : [...cur, p]))}
          />
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs">
                {f.kind === 'case' ? '📁' : '📄'} {f.name} <span className="text-gray-500">· {kb(f.size)}</span>
                <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))} aria-label={`הסרת ${f.name}`} className="w-6 h-6 rounded hover:bg-gray-200 flex items-center justify-center"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {suggest.length > 0 && (
        <label className="block">
          <span className="block text-sm font-semibold mb-1">לשמור עותק בתיק <span className="font-normal text-gray-500">(לא חובה)</span></span>
          <select value={saveTo} onChange={(e) => setSaveTo(e.target.value)} className={field}>
            <option value="">— לא לשמור —</option>
            {suggest.map((t) => (
              <option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>{t.label}{t.plate ? ` · ${t.plate}` : ''}</option>
            ))}
          </select>
        </label>
      )}
      {err && <p className="text-sm text-red-700">⚠️ {err}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void send()} className="h-12 px-6 rounded-xl bg-[#0078D4] hover:bg-[#106EBE] text-white font-bold inline-flex items-center gap-2 disabled:opacity-50">
          <Send size={17} aria-hidden="true" />
          {busy ? (files.length ? 'מעלה קבצים ושולח…' : 'שולח…') : 'שליחה'}
        </button>
        <button type="button" onClick={onClose} className="h-12 px-4 rounded-xl border border-gray-300 bg-white">ביטול</button>
      </div>
    </div>
  );
}

/** "📁 מהתיק": choose the case (suggested by the email's plates, or search), then tick its files. */
function CaseFilePicker({ api, suggest, chosen, onPick }: { api: MailApi; suggest: AttachTarget[]; chosen: string[]; onPick: (p: Picked) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<AttachTarget[] | null>(null);
  const [target, setTarget] = useState<AttachTarget | null>(suggest[0] ?? null);
  const [files, setFiles] = useState<TargetFile[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return setFound(null);
    const t = setTimeout(() => void api.searchAttachTargets(q).then(setFound), 300);
    return () => clearTimeout(t);
  }, [q, api]);
  useEffect(() => {
    if (!target) return setFiles(null);
    setFiles(null);
    void api.listTargetFiles(target.type, target.id).then(setFiles);
  }, [target, api]);

  const options = found ?? suggest;
  const groups = Array.from(new Set((files ?? []).map((f) => f.group)));
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5 space-y-2">
      <div className="flex gap-2 flex-wrap">
        {options.map((t) => (
          <button key={`${t.type}-${t.id}`} type="button" onClick={() => setTarget(t)} className={`h-10 px-2.5 rounded-lg border text-xs inline-flex items-center gap-1.5 ${target?.id === t.id ? 'border-gray-900 bg-white font-bold' : 'border-gray-300 bg-white'}`}>
            {t.plate && <LicensePlate plate={t.plate} size="sm" />}
            {t.label}
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש תיק: מספר רכב, שם לקוח, מספר תביעה" className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm" aria-label="חיפוש תיק לצירוף קבצים" />
      {target && files === null && <div className="h-10 rounded bg-gray-200 animate-pulse" />}
      {target && files?.length === 0 && <p className="text-xs text-gray-600">אין קבצים בתיק הזה.</p>}
      {target &&
        groups.map((g) => (
          <div key={g}>
            <p className="text-xs font-bold text-gray-600 mb-1">{g}</p>
            <ul className="space-y-1">
              {(files ?? [])
                .filter((f) => f.group === g)
                .map((f) => {
                  const key = `c-${target.type}-${target.id}-${f.src}-${f.id}`;
                  return (
                    <li key={key}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[36px]">
                        <input type="checkbox" checked={chosen.includes(key)} onChange={() => onPick({ key, name: f.name, size: f.size, kind: 'case', type: target.type, targetId: target.id, src: f.src, id: f.id })} className="w-4 h-4" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-gray-500">{f.size ? kb(f.size) : ''}</span>
                      </label>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
    </div>
  );
}
