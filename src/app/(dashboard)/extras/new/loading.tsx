import { Skeleton, SkeletonPanel } from '@/components/ui/Skeleton';

export default function ExtrasNewLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 max-w-lg">
      <Skeleton className="h-6 w-40" />
      <SkeletonPanel />
    </div>
  );
}
