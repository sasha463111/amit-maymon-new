import { Skeleton, SkeletonPanel } from '@/components/ui/Skeleton';

export default function PainterCaseLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <Skeleton className="h-7 w-52" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonPanel className="lg:col-span-1 h-72" />
        <SkeletonPanel className="lg:col-span-2 h-72" />
      </div>
    </div>
  );
}
