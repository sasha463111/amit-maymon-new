import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Latency probe (2026-10-13): 5 sequential tiny queries from the server to the
// database, timed. Used to measure the effect of the Vercel function region
// (the DB is in ap-south-1 / Mumbai). Anonymous key + RLS: returns no data,
// only milliseconds and the region the function ran in.
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never served from Next's fetch cache — every query must really travel.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });

  const ms: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    // A different query each time, so nothing upstream can answer from a cache.
    await db.from('branches').select('id').neq('name', `probe-${Date.now()}-${i}`).limit(1);
    ms.push(Date.now() - t);
  }
  return NextResponse.json(
    { region: process.env.VERCEL_REGION ?? 'local', queriesMs: ms, totalMs: ms.reduce((a, b) => a + b, 0) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
