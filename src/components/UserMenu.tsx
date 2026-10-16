'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, KeyRound, LogOut, Mail, Type } from 'lucide-react';
import { SendReportModal } from './SendReportModal';

// One personal menu instead of separate small buttons in the header (16/10,
// design round): who I am, change password, the daily report (CEO), log out.

export function UserMenu({ name, roleLabel, branchName, email, isCeo }: { name: string; roleLabel: string; branchName: string; email: string; isCeo: boolean }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  // Text size (16/10): set on <html data-text>, remembered on this device.
  const [textSize, setTextSize] = useState<'md' | 'lg' | 'xl'>('md');
  useEffect(() => {
    const t = document.documentElement.getAttribute('data-text');
    setTextSize(t === 'lg' || t === 'xl' ? t : 'md');
  }, []);
  function chooseText(t: 'md' | 'lg' | 'xl') {
    setTextSize(t);
    if (t === 'md') document.documentElement.removeAttribute('data-text');
    else document.documentElement.setAttribute('data-text', t);
    try {
      if (t === 'md') localStorage.removeItem('tehila-text');
      else localStorage.setItem('tehila-text', t);
    } catch {
      // private mode — applies for this visit only
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="התפריט האישי"
        className="h-10 flex items-center gap-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 ps-1 pe-1 sm:pe-2.5"
      >
        <span className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center">{initial}</span>
        <span className="hidden sm:block text-sm font-semibold text-gray-800 max-w-[140px] truncate">{name}</span>
        <ChevronDown size={14} className="hidden sm:block text-gray-500" />
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-1.5" dir="rtl">
          <div className="px-3 py-2 border-b border-gray-100 mb-1">
            <p className="font-bold text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-500">
              {roleLabel}
              {branchName !== '—' ? ` · ${branchName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2.5 h-11 px-3 text-sm text-gray-800">
            <Type size={17} className="text-gray-500" aria-hidden="true" />
            <span className="flex-1 whitespace-nowrap">גודל טקסט</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="גודל טקסט">
              {([['md', 'א', 'text-xs'], ['lg', 'א+', 'text-sm'], ['xl', 'א++', 'text-base']] as const).map(([k, l, cls]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => chooseText(k)}
                  aria-pressed={textSize === k}
                  className={`h-8 min-w-[40px] px-2 font-bold ${cls} ${textSize === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <a href="/account/password" className="flex items-center gap-2.5 h-11 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-50">
            <KeyRound size={17} className="text-gray-500" aria-hidden="true" />
            החלפת סיסמה
          </a>
          {isCeo && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReport(true);
              }}
              className="w-full flex items-center gap-2.5 h-11 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-50"
            >
              <Mail size={17} className="text-gray-500" aria-hidden="true" />
              שליחת דוח סיכום יומי
            </button>
          )}
          <a href="/logout" className="flex items-center gap-2.5 h-11 px-3 rounded-lg text-sm text-red-700 hover:bg-red-50">
            <LogOut size={17} aria-hidden="true" />
            יציאה מהמערכת
          </a>
        </div>
      )}
      {isCeo && <SendReportModal isOpen={report} onClose={() => setReport(false)} userEmail={email} userName={name} />}
    </div>
  );
}
