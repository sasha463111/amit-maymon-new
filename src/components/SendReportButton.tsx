'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { sendSummaryReport } from '@/app/actions/reports';

export function SendReportButton({ isCeo }: { isCeo: boolean }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!isCeo) return null; // Only show for CEO

  async function handleClick() {
    setLoading(true);
    setResult(null);
    const res = await sendSummaryReport();
    if (res?.ok) {
      setResult({ ok: true, msg: '✅ הדוח נשלח' });
    } else {
      setResult({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'}` });
    }
    setLoading(false);
  }

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        disabled={loading}
        title="שלח דוח סיכום יומי"
        className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center shrink-0 disabled:opacity-50 disabled:cursor-wait"
      >
        <Mail size={16} className={loading ? 'text-gray-400 animate-pulse' : 'text-gray-500'} />
      </button>

      {/* Tooltip with result */}
      {result && (
        <div className="absolute bottom-full right-0 mb-2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
          {result.msg}
        </div>
      )}
    </div>
  );
}
