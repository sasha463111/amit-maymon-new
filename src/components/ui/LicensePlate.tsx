import { formatIsraeliPlate } from '@/lib/plate';

interface LicensePlateProps {
  plate: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'h-5', digits: 'text-[10.5px] px-1.5', stripe: 'w-2.5 text-[5.5px]' },
  md: { box: 'h-[34px]', digits: 'text-base px-2.5', stripe: 'w-4 text-[8px]' },
  lg: { box: 'h-[46px]', digits: 'text-xl px-3.5', stripe: 'w-5 text-[10px]' },
} as const;

/** Renders a car's plate number styled like a real Israeli license plate. */
export function LicensePlate({ plate, size = 'md', className }: LicensePlateProps) {
  if (!plate) return null;
  const s = SIZES[size];

  return (
    <span
      dir="ltr"
      className={`inline-flex items-stretch shrink-0 rounded-[5px] overflow-hidden border-[1.5px] border-neutral-900 shadow-sm ${s.box} ${className ?? ''}`}
    >
      <span
        className={`flex items-center bg-[#FFCC00] text-black font-extrabold tabular-nums tracking-wide ${s.digits}`}
        style={{ fontFamily: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {formatIsraeliPlate(plate)}
      </span>
      <span
        className={`flex items-center justify-center bg-[#00329E] text-white font-extrabold border-l-[1.5px] border-neutral-900 [writing-mode:vertical-rl] ${s.stripe}`}
      >
        IL
      </span>
    </span>
  );
}
