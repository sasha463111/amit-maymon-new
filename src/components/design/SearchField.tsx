'use client';

import { Search } from 'lucide-react';

/** Case-list search. RTL with a leading search icon, rounded, paper surface. */
export function SearchField({
  value,
  onChange,
  placeholder = 'חיפוש לפי רישוי, לקוח או ביטוח',
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 h-11 px-3.5 rounded-md border-[1.5px] border-stone-300 bg-white shadow-xs focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--focus-ring)] transition-all">
      <Search size={18} strokeWidth={2} className="text-stone-400 shrink-0" />
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 min-w-0 border-none outline-none bg-transparent text-[15px] text-stone-900 placeholder:text-stone-400"
      />
    </div>
  );
}
