'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Paperclip, ChevronDown } from 'lucide-react';
import { MailBody } from '@/app/(dashboard)/mail/MailClient';
import type { AttachTarget, CaseEmail } from '@/lib/outlook';

// "📧 מיילים" in a repair case / insurance claim / referral (16/10): the emails
// saved here with "📎 שייך לתיק" from the "📧 דואר" screen — a copy that stays
// with the case. `load` = the listCaseEmails server action (or sample data).

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export function CaseEmails({ type, id, load, compact = false }: { type: AttachTarget['type']; id: string; load: (type: AttachTarget['type'], id: string) => Promise<CaseEmail[]>; compact?: boolean }) {
  const [rows, setRows] = useState<CaseEmail[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void load(type, id).then(setRows);
  }, [type, id, load]);

  return (
    <section className={`rounded-2xl border border-gray-200 bg-white ${compact ? 'p-3' : 'p-4'} space-y-2`} dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-gray-900">📧 מיילים בתיק {rows ? <span className="text-sm font-normal text-gray-500">({rows.length})</span> : null}</h3>
        <Link href="/mail" className="text-sm text-indigo-700 font-semibold">לתיבת הדואר ←</Link>
      </div>
      {rows === null && <div className="h-12 rounded-lg bg-gray-100 animate-pulse" />}
      {rows?.length === 0 && <p className="text-sm text-gray-600">עוד אין מיילים בתיק. ב&quot;📧 דואר&quot; פותחים מייל ולוחצים &quot;📎 שייך לתיק&quot;.</p>}
      <ul className="space-y-1.5">
        {rows?.map((m) => {
          const isOpen = open === m.id;
          return (
            <li key={m.id} className="rounded-xl border border-gray-200">
              <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} className="w-full text-start px-3 py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{m.subject || '(ללא נושא)'}</span>
                  <span className="block text-xs text-gray-600 truncate">
                    {m.fromName || m.fromEmail} · {fmt(m.receivedAt)}
                    {m.attachedBy ? ` · שויך ע״י ${m.attachedBy}` : ''}
                  </span>
                </span>
                {m.attachments.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 shrink-0">
                    <Paperclip size={13} aria-hidden="true" />
                    {m.attachments.length}
                  </span>
                )}
                <ChevronDown size={16} className={`text-gray-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 p-3 space-y-2">
                  {m.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((a) => (
                        <a key={a.path || a.name} href={a.path || undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-indigo-700 font-semibold">
                          <Paperclip size={12} aria-hidden="true" />
                          {a.name}
                        </a>
                      ))}
                    </div>
                  )}
                  <MailBody html={m.bodyHtml ?? `<p>${(m.preview ?? '').replace(/</g, '&lt;')}</p>`} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
