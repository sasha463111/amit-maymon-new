'use client';

import { AlertTriangle } from 'lucide-react';

/** Branded "something failed" state — what every route's error.tsx renders
 *  instead of Next.js's generic error screen. `reset` re-runs the segment
 *  that threw; `digest` is Next's server-side error reference, shown so a
 *  report to Sasha/support can point at something concrete. */
export function ErrorState({
  reset,
  digest,
  message = 'לא הצלחנו לטעון את המידע',
}: {
  reset: () => void;
  digest?: string;
  message?: string;
}) {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-6" role="alert">
      <div className="max-w-sm w-full flex flex-col items-center text-center gap-3.5">
        <div className="w-[52px] h-[52px] rounded-full bg-status-blocked-soft text-status-blocked flex items-center justify-center shrink-0">
          <AlertTriangle size={24} strokeWidth={2} />
        </div>
        <h3 className="text-[17px] font-bold text-stone-900">{message}</h3>
        <p className="text-[13.5px] text-stone-500 leading-relaxed">
          ייתכן שיש בעיית רשת זמנית. נסה שוב — אם זה חוזר, פנה לתמיכה.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-1 text-[13.5px] font-semibold text-white bg-brand-red hover:bg-brand-red-dark rounded-lg px-5 py-2 transition-colors"
        >
          נסה שוב
        </button>
        {digest && <span className="mt-0.5 font-mono text-[10.5px] text-stone-400">מזהה: {digest}</span>}
      </div>
    </div>
  );
}
