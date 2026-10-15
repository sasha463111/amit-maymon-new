'use client';

import { useState } from 'react';

const OTHER = '__other__';

/** A list + "אחר…" that opens free text (Amit 15/10: "ביטוח חקלאי" was missing and
 *  "אחר" led nowhere). A saved value that isn't on the list shows as "אחר" + its text. */
export function PickOrOther({
  value,
  onChange,
  options,
  placeholder = '— בחירה —',
  otherPlaceholder = 'הקלדה ידנית',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  otherPlaceholder?: string;
  className?: string;
}) {
  const listed = options.filter((o) => o !== 'אחר');
  const [other, setOther] = useState(!!value && !listed.includes(value));
  return (
    <div className="space-y-2">
      <select
        value={other ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="">{placeholder}</option>
        {listed.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OTHER}>אחר…</option>
      </select>
      {other && <input type="text" value={value === 'אחר' ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder={otherPlaceholder} className={className} autoFocus autoComplete="off" />}
    </div>
  );
}
