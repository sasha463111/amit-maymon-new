'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { SendReportModal } from './SendReportModal';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SendReportButton({ isCeo }: { isCeo: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    if (isCeo) {
      createClient().auth.getUser().then(({ data }) => {
        setUserEmail(data.user?.email || '');
      });
    }
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
      <SendReportModal isOpen={isOpen} onClose={() => setIsOpen(false)} userEmail={userEmail} />
    </>
  );
}
