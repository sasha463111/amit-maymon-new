import { createClient } from '@/lib/supabase/server';
import { SystemMessageBanner } from './SystemMessageBanner';

// Rendered as CasesMasterDetail's `children` on the /cases index route.
// The "pick a case" placeholder that used to live here is gone — browsing
// now shows the dense table directly instead of an empty detail pane, so
// this component's only job left is the system-wide announcement banner.
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

  if (!sysMessage && !isCeo) return null;
  return <SystemMessageBanner message={sysMessage?.message ?? null} messageId={sysMessage?.id ?? null} isCeo={isCeo} />;
}
