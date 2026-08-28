/**
 * Extracted from CaseDetailClientV2.tsx (safe first step of the god-component
 * refactor). Pure presentational — the `timeline` array itself is still built
 * by the parent's useMemo (it depends on STEP_LABELS/userNames/auditEvents,
 * all parent-owned), this component just renders it.
 */
export interface TimelineItem {
  id: string;
  type: 'step' | 'case';
  stepLabel: string;
  timestamp: string;
  performedBy: string | null;
}

export function TimelineSection({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
        <span className="text-2xl">⏱️</span>
        ציר זמן
      </h2>
      <div className="relative">
        <div className="absolute right-6 top-0 bottom-0 w-0.5 bg-blue-200" />
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="relative flex items-start gap-4 pr-6">
              <div
                className={`flex-shrink-0 w-4 h-4 rounded-full mt-1 z-10 ${
                  item.type === 'case' ? 'bg-blue-500' : 'bg-green-500'
                }`}
              />
              <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-800">{item.stepLabel}</div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span>🕐</span>
                      <span>
                        {new Date(item.timestamp).toLocaleString('he-IL', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {item.performedBy && (
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <span>👤</span>
                        <span>בוצע על ידי: {item.performedBy}</span>
                      </div>
                    )}
                  </div>
                  {item.type === 'step' && (
                    <span className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ הושלם
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
