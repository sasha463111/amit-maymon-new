'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function SystemMessageBanner({
  message,
  messageId,
  isCeo,
}: {
  message: string | null;
  messageId: string | null;
  isCeo: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message ?? '');
  const [saving, setSaving] = useState(false);

  async function saveMessage() {
    setSaving(true);
    const supabase = createClient();
    if (!draft.trim()) {
      // Deactivate existing message
      if (messageId) {
        await supabase.from('system_messages').update({ is_active: false } as never).eq('id', messageId);
      }
    } else if (messageId) {
      await supabase.from('system_messages').update({ message: draft, is_active: true } as never).eq('id', messageId);
    } else {
      await supabase.from('system_messages').insert({ message: draft } as never);
    }
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (!message && !isCeo) return null;

  return (
    <div className="mb-5">
      {editing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2">הודעה יומית לצוות</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="כתוב הודעה לכל הצוות..."
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-white"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => void saveMessage()}
              disabled={saving}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(message ?? ''); }}
              className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : message ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg flex-shrink-0">📢</span>
          <p className="flex-1 text-sm text-amber-900 font-medium leading-relaxed">{message}</p>
          {isCeo && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex-shrink-0 text-xs text-amber-600 hover:text-amber-800 underline"
            >
              עריכה
            </button>
          )}
        </div>
      ) : isCeo ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-right px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-dashed border-amber-300 rounded-xl text-sm text-amber-600 transition-colors"
        >
          + הוסף הודעה יומית לצוות
        </button>
      ) : null}
    </div>
  );
}
