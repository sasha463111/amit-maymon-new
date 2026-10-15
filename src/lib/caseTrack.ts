// "מעקב רכב" for the customer (16/10, design round): the repair stages as the
// customer understands them, from the case's painter_status / dates. Shared by
// the public page (/t/[token]) and the staff preview.

export const TRACK_STEPS = ['הרכב התקבל במוסך', 'אישור שמאי / ביטוח', 'הזמנת חלקים', 'תיקון וצבע', 'מוכן לאיסוף'] as const;

export const TRACK_LINK_DAYS = 45;
/** Who may send the link — pilot: CEO only (new features start CEO-only). */
export const TRACK_LINK_ROLES: readonly string[] = ['CEO'];

export type TrackView = {
  firstName: string;
  plate: string | null;
  vehicle: string | null;
  branchName: string | null;
  /** Index of the current step in TRACK_STEPS; TRACK_STEPS.length = delivered. */
  step: number;
  /** A short line under the current step. */
  note: string;
  since: string | null;
  openedAt: string | null;
};

export function trackStep(c: { painter_status: string | null; closed_at: string | null; painter_finished_at: string | null; treatment_finished_at: string | null }): { step: number; note: string } {
  if (c.closed_at) return { step: TRACK_STEPS.length, note: 'הרכב נמסר. תודה שבחרת בנו!' };
  if (c.painter_finished_at || c.treatment_finished_at || c.painter_status === 'READY_FOR_RELEASE') return { step: 4, note: 'העבודה הסתיימה — אפשר לתאם איסוף' };
  switch (c.painter_status) {
    case 'IN_WORK':
      return { step: 3, note: 'הרכב בעבודה אצל הפחח / בצבע' };
    case 'PARTS_ARRIVED':
      return { step: 3, note: 'החלקים הגיעו — הרכב נכנס לתיקון' };
    case 'WAITING_PARTS':
      return { step: 2, note: 'החלקים הוזמנו ואנחנו ממתינים להגעתם' };
    case 'WAITING_APPRAISER':
      return { step: 1, note: 'ממתינים לשמאי / לאישור חברת הביטוח' };
    default:
      return { step: 1, note: 'הרכב בטיפול — נעדכן בכל שלב' };
  }
}
