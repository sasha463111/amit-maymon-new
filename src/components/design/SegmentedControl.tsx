'use client';

/** Compact filter switch (e.g. branch: הכל / נתיבות / אשקלון). The selected
 *  segment lifts onto a paper chip. */
export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="tablist" className="inline-flex w-full p-[3px] gap-0.5 bg-surface-container rounded-md border border-stone-200">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 min-h-[38px] px-3 rounded-sm transition-all text-sm whitespace-nowrap ${
              selected ? 'bg-white text-stone-900 font-semibold shadow-xs' : 'text-stone-500 font-medium hover:text-stone-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
