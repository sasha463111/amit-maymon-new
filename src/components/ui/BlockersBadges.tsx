import { AlertTriangle } from 'lucide-react';
import type { PartsStatus } from '@/types/database';

interface BlockersBadgesProps {
  partsStatus: PartsStatus;
  hasExtrasInTreatment: boolean;
  approvalBlocked: boolean;
}

export function BlockersBadges({
  partsStatus,
  hasExtrasInTreatment,
  approvalBlocked,
}: BlockersBadgesProps) {
  const partsMissing = partsStatus !== 'AVAILABLE';
  const badges: string[] = [];
  if (partsMissing) badges.push('חסרים חלקים');
  if (hasExtrasInTreatment) badges.push('תוספת בטיפול');
  if (approvalBlocked) badges.push('חסר אישור עמית');

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
        >
          <AlertTriangle size={10} className="flex-shrink-0" />
          {b}
        </span>
      ))}
    </div>
  );
}
