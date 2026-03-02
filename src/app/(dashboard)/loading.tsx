export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]" aria-label="טוען">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">טוען...</span>
      </div>
    </div>
  );
}
