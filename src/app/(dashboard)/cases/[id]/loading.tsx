import { SkeletonPanel } from '@/components/ui/Skeleton';

export default function CaseDetailLoading() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4" aria-label="טוען תיק">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonPanel className="lg:col-span-1 h-96" />
        <SkeletonPanel className="lg:col-span-2 h-96" />
      </div>
      <SkeletonPanel className="h-48" />
    </div>
  );
}
