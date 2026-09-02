'use client';

import { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { SendReportModal } from './SendReportModal';
import { createClient } from '@/lib/supabase/client';

export function SendReportButton({ isCeo }: { isCeo: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!isCeo) return;

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        setUserName((data as any)?.full_name || '');
      }
    })();
  }, [isCeo]);

  if (!isCeo) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="שלח דוח סיכום יומי"
        className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center shrink-0"
      >
        <Mail size={16} className="text-gray-500" />
      </button>
      <SendReportModal isOpen={isOpen} onClose={() => setIsOpen(false)} userEmail={userEmail} userName={userName} />
    </>
  );
}
