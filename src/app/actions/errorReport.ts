'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { recordAppError } from '@/lib/errorLog.server';

// #43 (15/10): the browser's door to the in-house error monitor (see
// ErrorReporter + src/lib/errorLog.server.ts). This export is public (every
// 'use server' export is): the source is whitelisted, the user comes from
// the session (never from the input), and recordAppError trims everything
// and caps anonymous rows and auto-tickets.

export type ClientError = { source: 'boundary' | 'window' | 'promise'; message: string; digest?: string; path: string; stack?: string };

export async function reportClientError(e: ClientError): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await recordAppError({
      source: e?.source === 'window' || e?.source === 'promise' ? e.source : 'boundary',
      message: typeof e?.message === 'string' ? e.message : '',
      digest: typeof e?.digest === 'string' ? e.digest : null,
      path: typeof e?.path === 'string' ? e.path : '/',
      stack: typeof e?.stack === 'string' ? e.stack : null,
      userId: user?.id ?? null,
      userAgent: headers().get('user-agent'),
    });
  } catch {
    // never throw from the reporter
  }
}
