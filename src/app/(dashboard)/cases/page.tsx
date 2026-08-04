import { createClient } from '@/lib/supabase/server';
import { SystemMessageBanner } from './SystemMessageBanner';
import { FolderOpen } from 'lucide-react';

export default async function CasesIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isCeo = false;
  let sysMessage: { id: string; message: string } | undefined;
  if (user) {
    const [{ data: profileData }, { data: sysMessages }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('system_messages').select('id, message').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
    ]);
    isCeo = (profileData as { role: string } | null)?.role === 'CEO';
    sysMessage = (sysMessages ?? [])[0] as { id: string; message: string } | undefined;
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-6">
      <SystemMessageBanner message={sysMessage?.message ?? null} messageId={sysMessage?.id ?? null} isCeo={isCeo} />
      <div className="flex-1 flex flex-col items-center justify-center text-center text-stone-400 gap-3 py-16">
        <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center">
          <FolderOpen size={28} className="text-stone-400" />
        </div>
        <p className="text-stone-500 font-medium">בחר תיק מהרשימה כדי לראות את הפרטים</p>
        <p className="text-stone-400 text-sm">או פתח תיק חדש</p>
      </div>
    </div>
  );
}
