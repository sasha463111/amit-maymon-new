/** Shimmering placeholder bar. The building block every loading.tsx composes
 *  from, so every screen's "still loading" moment uses the same visual
 *  language (stone tokens, same pulse) instead of each route inventing its
 *  own gray box. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-stone-200 ${className}`} />;
}

/** One list-rail row, shaped like CaseRow / a Kanban card's list cousin:
 *  identity block + status pill up top, a plate-sized bar, a footer line. */
export function SkeletonRow() {
  return (
    <div className="w-full flex flex-col gap-3 p-4 rounded-lg border-[1.5px] border-stone-200 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full shrink-0" />
      </div>
      <Skeleton className="h-7 w-2/5 rounded-[5px]" />
      <div className="flex items-center justify-between pt-1 border-t border-stone-100">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

/** A stack of SkeletonRow, for any list/rail screen (approvals, extras,
 *  notifications, archive). */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** One Kanban card, shaped like a PaintersBoard card. */
export function SkeletonKanbanCard() {
  return (
    <div className="rounded-lg border-[1.5px] border-stone-200 bg-white p-3 flex flex-col gap-2">
      <Skeleton className="h-6 w-3/5 rounded-[5px]" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

/** A full Kanban board skeleton — a few columns, a couple of cards each. */
export function SkeletonKanban({ columns = 3 }: { columns?: number }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto">
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="flex-1 min-w-[190px] flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          {Array.from({ length: c === 1 ? 1 : 2 }).map((_, i) => (
            <SkeletonKanbanCard key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A generic content block — for form/detail screens (settings, extras/new,
 *  a case-like detail page) that aren't a list or a board. */
export function SkeletonPanel({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-5 flex flex-col gap-3 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
