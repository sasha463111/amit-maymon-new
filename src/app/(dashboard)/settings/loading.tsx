import { Skeleton, SkeletonPanel } from '@/components/ui/Skeleton';

export default function SettingsLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 max-w-2xl">
      <Skeleton className="h-6 w-24" />
      <SkeletonPanel />
      <SkeletonPanel />
    </div>
  );
}
