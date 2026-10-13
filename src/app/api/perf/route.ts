import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Speed samples from the browser (src/components/PerfBeacon.tsx), 2026-10-13.
// Logged-in users only; stores role + normalized path + timings, nothing else.
export const dynamic = 'force-dynamic';

const KINDS = new Set(['load', 'nav', 'bell']);
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = (data?.claims?.sub as string | undefined) ?? null;
    if (!userId) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const samples = Array.isArray(body?.samples) ? (body!.samples as Record<string, unknown>[]).slice(0, 20) : [];
    const rows = samples
      .filter((s) => KINDS.has(String(s.kind)) && int(s.ms, 600000) !== null)
      .map((s) => ({
        user_id: userId,
        role: typeof s.role === 'string' ? s.role.slice(0, 30) : null,
        kind: String(s.kind),
        path: typeof s.path === 'string' ? s.path.slice(0, 120) : null,
        ms: int(s.ms, 600000)!,
        ttfb: int(s.ttfb, 600000),
        net: typeof s.net === 'string' ? s.net.slice(0, 10) : null,
        rtt: int(s.rtt, 60000),
        mobile: typeof s.mobile === 'boolean' ? s.mobile : null,
      }));
    if (!rows.length) return new NextResponse(null, { status: 204 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      await db.from('perf_samples').insert(rows);
    }
  } catch {
    // Measurement must never bother anyone.
  }
  return new NextResponse(null, { status: 204 });
}
