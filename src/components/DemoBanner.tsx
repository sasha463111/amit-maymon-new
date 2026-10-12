import { DEMO_MODE } from '@/lib/demo';

/** Strip shown on every page of the demo site only (renders nothing in production). */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="bg-indigo-600 px-4 py-1.5 text-center text-sm font-semibold text-white">
      גרסת הדגמה — כל השמות, הרכבים והנתונים בדויים
    </div>
  );
}
