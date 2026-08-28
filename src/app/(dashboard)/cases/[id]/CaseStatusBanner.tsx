import Link from 'next/link';

/**
 * Extracted from CaseDetailClientV2.tsx (safe first step of the god-component
 * refactor — see the memory/plan discussion). Pure presentational: derives
 * nothing, just renders whichever of the three mutually-exclusive banners
 * matches the case's current state. Order matters — closed beats in-closure
 * beats active, matching the isClosed/isInClosure/isActive precedence in the
 * parent.
 */
export function CaseStatusBanner({
  isClosed,
  closedAt,
  isInClosure,
  treatmentFinishedAt,
  isActive,
  activeProfessionalStepLabel,
  role,
  caseId,
}: {
  isClosed: boolean;
  closedAt?: string | null;
  isInClosure: boolean;
  treatmentFinishedAt?: string | null;
  isActive: boolean;
  activeProfessionalStepLabel: string | null;
  role: string | null;
  caseId: string;
}) {
  if (isClosed) {
    return (
      <div className="bg-gradient-to-l from-gray-100 to-gray-50 border-2 border-gray-300 rounded-xl px-5 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-400 text-white flex items-center justify-center text-lg">🔒</div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-700">תיק סגור</p>
          <p className="text-xs text-gray-500">
            נסגר בתאריך {closedAt ? new Date(closedAt).toLocaleDateString('he-IL') : '—'}
          </p>
        </div>
      </div>
    );
  }

  if (isInClosure) {
    return (
      <div className="bg-gradient-to-l from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl px-5 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-400 text-white flex items-center justify-center text-lg">📋</div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">הועבר למשרד — בתהליך סגירה</p>
          <p className="text-xs text-amber-700">
            הסתיים הטיפול המקצועי בתאריך{' '}
            {treatmentFinishedAt ? new Date(treatmentFinishedAt).toLocaleDateString('he-IL') : '—'} —
            אילנה משלימה את הסגירה.
          </p>
        </div>
        {(role === 'OFFICE' || role === 'CEO') && (
          <Link
            href={`/closure/${caseId}`}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0"
          >
            המשך סגירה ←
          </Link>
        )}
      </div>
    );
  }

  if (isActive && activeProfessionalStepLabel) {
    return (
      <div className="bg-gradient-to-l from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl px-5 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg">⏱</div>
        <div className="flex-1">
          <p className="text-xs text-blue-700 font-medium">השלב הנוכחי</p>
          <p className="text-base font-bold text-blue-900">{activeProfessionalStepLabel}</p>
        </div>
      </div>
    );
  }

  return null;
}
