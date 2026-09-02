'use client';

import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { sendSummaryReport } from '@/app/actions/reports';
import { listSystemUsers } from '@/app/actions/users';

interface SendReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName: string;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  CEO: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-200' },
  SERVICE_MANAGER: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-200' },
  OFFICE: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-200' },
  PAINTER: { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-200' },
  SERVICE_ADVISOR: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-200' },
};

export function SendReportModal({ isOpen, onClose, userEmail, userName }: SendReportModalProps) {
  const [to, setTo] = useState('');
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
    const res = await sendSummaryReport();
    setLoading(false);

    if (res?.ok) {
      setResult({ ok: true, msg: '✅ הדוח נשלח בהצלחה' });
      setTimeout(() => {
        onClose();
        setResult(null);
        setTo('');
        setCc('');
        setBcc('');
      }, 2000);
    } else {
      setResult({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'}` });
    }
  }

  const addToField = (email: string, field: 'to' | 'cc' | 'bcc') => {
    const setter = field === 'to' ? setTo : field === 'cc' ? setCc : setBcc;
    const current = field === 'to' ? to : field === 'cc' ? cc : bcc;

    // Don't add if already in field, and don't add Tomer to bcc (already there)
    if (field === 'bcc' && email === userEmail) {
      return; // Tomer already in bcc, can't add
    }

    if (!current.includes(email)) {
      setter(current ? `${current}, ${email}` : email);
    }
  };

  const removeFromField = (email: string, field: 'to' | 'cc' | 'bcc') => {
    const setter = field === 'to' ? setTo : field === 'cc' ? setCc : setBcc;
    const current = field === 'to' ? to : field === 'cc' ? cc : bcc;
    const newVal = current.split(',').map(e => e.trim()).filter(e => e !== email).join(', ');
    setter(newVal);
  };

  const toRecipients = to ? to.split(',').map(e => e.trim()).filter(Boolean) : [];
  const ccRecipients = cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : [];
  const bccRecipients = bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean) : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold">📧 שלח דוח סיכום יומי</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* To Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">📧 To:</label>
            <textarea
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="הקלד או בחר מרשימת המשתמשים"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
            />
            {toRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {toRecipients.map((email) => (
                  <span key={email} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs flex items-center gap-1">
                    📧 {email}
                    <button onClick={() => removeFromField(email, 'to')} className="hover:text-blue-900">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Cc Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">📋 Cc:</label>
            <textarea
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="אופציונלי"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
            />
            {ccRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ccRecipients.map((email) => (
                  <span key={email} className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs flex items-center gap-1">
                    📋 {email}
                    <button onClick={() => removeFromField(email, 'cc')} className="hover:text-amber-900">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* BCC Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">🔒 Bcc:</label>
            <textarea
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="אופציונלי"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
            />
            {bccRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {bccRecipients.map((email) => (
                  <span key={email} className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs flex items-center gap-1">
                    🔒 {email}
                    <button onClick={() => removeFromField(email, 'bcc')} className="hover:text-purple-900">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* User Selector */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">בחר נמענים:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users.map((user) => {
                const colors = ROLE_COLORS[user.role] || ROLE_COLORS.SERVICE_ADVISOR;
                return (
                  <div key={user.id} className={`${colors.bg} border border-gray-200 rounded-lg p-3 flex items-center justify-between`}>
                    <div>
                      <p className={`font-medium text-sm ${colors.text}`}>{user.full_name}</p>
                      <p className="text-xs text-gray-600">{user.role}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => addToField(user.full_name, 'to')}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded"
                      >
                        To
                      </button>
                      <button
                        onClick={() => addToField(user.full_name, 'cc')}
                        className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded"
                      >
                        Cc
                      </button>
                      <button
                        onClick={() => addToField(user.full_name, 'bcc')}
                        className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded"
                      >
                        Bcc
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`p-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {result.msg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            <button
              onClick={handleSend}
              disabled={loading || !to.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <Send size={16} />
              {loading ? '⏳ שולח...' : 'שלח'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
