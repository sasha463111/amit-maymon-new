'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Date input that always shows DD/MM/YYYY, regardless of the machine's locale.
 *
 * Why this exists: a native <input type="date"> renders in the operating
 * system's regional format, not the page's. On a Windows machine left on
 * US settings it shows 09/23/2026 for 23 September — which office staff read
 * as 9 March. Nothing in CSS or HTML can override that; the only fix is to
 * stop relying on the browser's rendering.
 *
 * So the visible field is a plain text input we format ourselves, with a
 * hidden native date input kept alongside purely to open the OS date picker
 * when the calendar button is pressed. Typing and picking both work, and the
 * displayed format is identical on every machine.
 *
 * Values in and out are always ISO (YYYY-MM-DD), so callers and the database
 * are unaffected.
 *
 * Conversion is done with string splitting rather than `new Date(...)` on
 * purpose: parsing "2026-09-23" as a Date yields UTC midnight, which in
 * Israel's timezone can render as the previous day.
 */

export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Accepts what people actually type: 23/9/2026, 23-09-2026, 23.9.26.
 * Returns ISO, or null while the input is still incomplete or invalid.
 */
function displayToIso(text: string): string | null {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) year += year < 70 ? 2000 : 1900;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject impossible days (31/02) by checking the calendar length of the month.
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function DateField({
  value,
  onChange,
  onBlur,
  className = '',
  disabled = false,
  autoFocus = false,
}: {
  /** ISO date, YYYY-MM-DD, or '' for empty. */
  value: string;
  /** Called with ISO (or '' when cleared). Only fires on a complete, valid date. */
  onChange: (iso: string) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  // Re-sync when the value changes from outside (server refresh, reset, or the
  // picker). Skipped while the field holds a half-typed date so we don't wipe
  // what the user is in the middle of entering.
  useEffect(() => {
    if (displayToIso(text) !== value) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleText(next: string) {
    setText(next);
    if (next.trim() === '') {
      onChange('');
      return;
    }
    const iso = displayToIso(next);
    if (iso) onChange(iso);
  }

  function handleBlur() {
    // Normalise 3/9/26 to 03/09/2026 once they leave the field, so the stored
    // and displayed values agree.
    const iso = displayToIso(text);
    if (iso) setText(isoToDisplay(iso));
    else if (text.trim() === '') setText('');
    else setText(isoToDisplay(value)); // unparseable — restore last good value
    onBlur?.();
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        placeholder="DD/MM/YYYY"
        aria-label="תאריך בתבנית יום/חודש/שנה"
        className="w-full bg-transparent outline-none text-start"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          // showPicker() is the only way to open the native calendar from a
          // custom control; fall back to focusing it where unsupported.
          if (typeof el.showPicker === 'function') el.showPicker();
          else el.focus();
        }}
        className="shrink-0 px-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
        aria-label="בחר תאריך מלוח שנה"
        title="בחר מלוח שנה"
      >
        📅
      </button>
      {/* Hidden native input — exists only to provide the OS date picker. */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onChange(e.target.value);
          setText(isoToDisplay(e.target.value));
        }}
        className="absolute inset-y-0 left-0 w-0 opacity-0 pointer-events-none"
      />
    </div>
  );
}
