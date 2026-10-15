'use client';

import { useEffect, useRef, useState } from 'react';

// "🎤 הכתבה" (#15, Galit 15/10: "לדבר עם המערכת והיא תרשום במקום הקלדה").
// One component for every free-text box: when a <textarea> has focus, a mic
// button appears at its corner; speech (Hebrew) is typed in at the cursor.
// Uses the browser's own speech recognition (Chrome / Edge / Android / iPhone
// Safari) — no service of ours. Hidden where the browser has none. Opt out
// with data-no-dictate on the textarea.

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function recognizer(): Rec | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

/** Insert text at the caret of a React-controlled textarea (and tell React). */
function insertAtCaret(el: HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const sep = before && !/\s$/.test(before) ? ' ' : '';
  const next = before + sep + text + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = (before + sep + text).length;
  el.setSelectionRange(caret, caret);
}

export function DictationAssist() {
  const [supported, setSupported] = useState(false);
  const [target, setTarget] = useState<HTMLTextAreaElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const targetRef = useRef<HTMLTextAreaElement | null>(null);
  targetRef.current = target;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  // Follow the focused textarea.
  useEffect(() => {
    if (!supported) return;
    let hideTimer: number | undefined;
    const take = (el: EventTarget | Element | null) => {
      if (el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled && !el.hasAttribute('data-no-dictate')) {
        window.clearTimeout(hideTimer);
        setErr(null);
        setTarget(el);
      }
    };
    const onIn = (e: FocusEvent) => take(e.target);
    // A box that already had the focus before this mounted (autoFocus).
    take(document.activeElement);
    const onOut = (e: FocusEvent) => {
      if (e.target !== targetRef.current) return;
      // Leave time for a click on the mic itself (it keeps the focus anyway).
      hideTimer = window.setTimeout(() => {
        if (document.activeElement !== targetRef.current) {
          rec.current?.stop();
          setTarget(null);
        }
      }, 150);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      window.clearTimeout(hideTimer);
    };
  }, [supported]);

  // Keep the button on the textarea's bottom-left corner (the end side in RTL).
  useEffect(() => {
    if (!target) return setPos(null);
    const place = () => {
      const r = target.getBoundingClientRect();
      setPos({ top: r.bottom - 42, left: r.left + 6 });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const ro = new ResizeObserver(place);
    ro.observe(target);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      ro.disconnect();
    };
  }, [target]);

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = recognizer();
    if (!r || !target) return;
    r.lang = 'he-IL';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const el = targetRef.current;
      if (!el) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) insertAtCaret(el, res[0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      setErr(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'צריך לאשר לדפדפן גישה למיקרופון' : e.error === 'no-speech' ? 'לא נשמע דיבור — נסו שוב' : 'ההכתבה נעצרה');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setErr(null);
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  if (!supported || !target || !pos) return null;
  return (
    <div className="fixed z-[70] flex items-center gap-1.5" style={{ top: pos.top, left: pos.left }} dir="rtl">
      <button
        type="button"
        // Keep the focus (and the caret) in the textarea.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        aria-label={listening ? 'עצירת הכתבה' : 'הכתבה קולית'}
        title={listening ? 'עצירת הכתבה' : 'הכתבה קולית — לדבר במקום להקליד'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md border ${listening ? 'bg-red-600 border-red-700 text-white animate-pulse' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <path d="M12 17v5" />
        </svg>
      </button>
      {listening && <span className="text-xs font-semibold bg-red-600 text-white rounded-full px-2 py-0.5 shadow">מקשיב… לחצו לעצירה</span>}
      {err && !listening && <span className="text-xs bg-white border border-amber-300 text-amber-800 rounded-full px-2 py-0.5 shadow">{err}</span>}
    </div>
  );
}
