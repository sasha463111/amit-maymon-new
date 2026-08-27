import { Skeleton, SkeletonKanban } from '@/components/ui/Skeleton';

export default function PaintersLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <Skeleton className="h-6 w-32" />
      <SkeletonKanban columns={4} />
    </div>
  );
}
