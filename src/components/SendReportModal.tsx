'use client';

import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { sendSummaryReport } from '@/app/actions/reports';

interface SendReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export function SendReportModal({ isOpen, onClose, userEmail }: SendReportModalProps) {
  const [to, setTo] = useState('Amitm@toyota-tehila.co.il');
  const [cc, setCc] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!isOpen) return null;

  async function handleSend() {
    setLoading(true);
    setResult(null);
    const res = await sendSummaryReport();
    setLoading(false);
    if (res?.ok) {
      setResult({ ok: true, msg: '✅ הדוח נשלח בהצלחה' });
      setTimeout(() => {
        onClose();
        setResult(null);
      }, 2000);
    } else {
      setResult({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'}` });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">שלח דוח סיכום יומי</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {/* To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To:</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="recipient@example.com"
            />
          </div>

          {/* Cc */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cc:</label>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="optional"
            />
          </div>

          {/* BCC (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bcc:</label>
            <div className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-600">
              {userEmail}
            </div>
            <p className="text-xs text-gray-500 mt-1">אתה תהיה ב-BCC תמיד</p>
          </div>

          {/* Result */}
          {result && (
            <div className={`p-3 rounded text-sm ${result.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
              {result.msg}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSend}
              disabled={loading || !to}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm"
            >
              <Send size={16} />
              {loading ? 'שולח...' : 'שלח'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
