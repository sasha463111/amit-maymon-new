import { Fragment } from 'react';

// Israeli plate grouping (current format): 8 digits -> 3-2-3, 7 digits -> 2-3-2.
function groupPlate(plate: string): string[] {
  const d = String(plate ?? '').replace(/\D/g, '');
  if (d.length === 8) return [d.slice(0, 3), d.slice(3, 5), d.slice(5)];
  if (d.length === 7) return [d.slice(0, 2), d.slice(2, 5), d.slice(5)];
  return [d || String(plate ?? '')];
}

/** A small Israeli flag (white field, two blue stripes, Star of David). */
function IsraelFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 33 24" className={className} aria-hidden>
      <rect width="33" height="24" fill="#fff" />
      <rect width="33" height="3" y="3.5" fill="#0038b8" />
      <rect width="33" height="3" y="17.5" fill="#0038b8" />
      <g fill="none" stroke="#0038b8" strokeWidth="1.4">
        <path d="M16.5 8 L20 14 L13 14 Z" />
        <path d="M16.5 16 L20 10 L13 10 Z" />
      </g>
    </svg>
  );
}

/** Israeli license plate, rendered like the real thing: yellow field, black
 *  bold tabular digits grouped with dashes, and a blue "IL" band with the flag. */
export function Plate({ number, size = 'md' }: { number: string; size?: 'sm' | 'md' | 'lg' }) {
  const groups = groupPlate(number);
  const s =
    size === 'sm'
      ? { h: 'h-6', text: 'text-[13px]', band: 'w-4', flag: 'w-3', il: 'text-[6px]', px: 'px-1.5', gap: 'gap-0.5' }
      : size === 'lg'
        ? { h: 'h-11', text: 'text-2xl', band: 'w-7', flag: 'w-5', il: 'text-[10px]', px: 'px-3', gap: 'gap-1.5' }
        : { h: 'h-8', text: 'text-base', band: 'w-5', flag: 'w-3.5', il: 'text-[7px]', px: 'px-2', gap: 'gap-1' };

  return (
    <span
      dir="ltr"
      className={`inline-flex w-fit self-start items-stretch ${s.h} rounded-[5px] overflow-hidden border-[1.5px] border-stone-900 shadow-xs select-none align-middle shrink-0`}
    >
      {/* Blue IL band (left) */}
      <span className={`flex flex-col items-center justify-center bg-[#0038b8] text-white ${s.band} py-0.5`}>
        <IsraelFlag className={`${s.flag} rounded-[1px]`} />
        <span className={`${s.il} font-bold leading-none mt-0.5`}>IL</span>
      </span>
      {/* Yellow digit field */}
      <span className={`flex items-center justify-center bg-[#f4c400] text-stone-950 font-extrabold tabular tracking-tight ${s.text} ${s.px} ${s.gap} whitespace-nowrap`}>
        {groups.map((g, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="opacity-50 font-bold px-px">-</span>}
            <span>{g}</span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}
