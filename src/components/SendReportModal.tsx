'use client';

import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { sendSummaryReport } from '@/app/actions/reports';
import { listSystemUsers } from '@/app/actions/users';

interface SendReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export function SendReportModal({ isOpen, onClose, userEmail }: SendReportModalProps) {
  const [to, setTo] = useState('Amitm@toyota-tehila.co.il');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      listSystemUsers().then((res) => {
        setUsers((res.data || []) as any[]);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSend() {
    setLoading(true);
    setResult(null);

    // Add current user to BCC automatically (invisible to user)
    const finalBcc = bcc ? `${bcc},${userEmail}` : userEmail;

    const res = await sendSummaryReport();
    setLoading(false);
    if (res?.ok) {
      setResult({ ok: true, msg: '✅ הדוח נשלח בהצלחה' });
      setTimeout(() => {
        onClose();
        setResult(null);
        setTo('Amitm@toyota-tehila.co.il');
        setCc('');
        setBcc('');
      }, 2000);
    } else {
      setResult({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'}` });
    }
  }

  const addUserToField = (email: string, field: 'to' | 'cc' | 'bcc') => {
    if (field === 'to') {
      setTo(to ? `${to},${email}` : email);
    } else if (field === 'cc') {
      setCc(cc ? `${cc},${email}` : email);
    } else if (field === 'bcc') {
      setBcc(bcc ? `${bcc},${email}` : email);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
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
            <textarea
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="recipient@example.com"
            />
            <div className="mt-2">
              <p className="text-xs text-gray-600 mb-1">בחר משתמשים:</p>
              <div className="flex flex-wrap gap-1">
                {users.slice(0, 3).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addUserToField(u.full_name || u.id, 'to')}
                    className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded"
                  >
                    {u.full_name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cc */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cc:</label>
            <textarea
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="optional"
            />
            <div className="mt-2">
              <p className="text-xs text-gray-600 mb-1">בחר משתמשים:</p>
              <div className="flex flex-wrap gap-1">
                {users.slice(0, 3).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addUserToField(u.full_name || u.id, 'cc')}
                    className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-2 py-1 rounded"
                  >
                    {u.full_name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bcc */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bcc:</label>
            <textarea
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="optional (הנוכחי - אתה - יתווסף אוטומטית)"
            />
            <p className="text-xs text-gray-500 mt-1">✓ {userEmail} יתווסף אוטומטית ולא יופיע</p>
            <div className="mt-2">
              <p className="text-xs text-gray-600 mb-1">בחר משתמשים:</p>
              <div className="flex flex-wrap gap-1">
                {users.slice(0, 3).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addUserToField(u.full_name || u.id, 'bcc')}
                    className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded"
                  >
                    {u.full_name}
                  </button>
                ))}
              </div>
            </div>
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
