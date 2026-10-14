'use client';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="h-9 px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold">
      🖨️ הדפסה / שמירה כ-PDF
    </button>
  );
}
