import { Skeleton, SkeletonPanel } from '@/components/ui/Skeleton';

export default function ClosureCaseLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <Skeleton className="h-7 w-52" />
      <SkeletonPanel className="h-96" />
    </div>
  );
}
