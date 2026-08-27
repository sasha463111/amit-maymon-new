import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';

export default function NotificationsLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <Skeleton className="h-6 w-28" />
      <SkeletonList count={5} />
    </div>
  );
}
