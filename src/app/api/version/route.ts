import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The live build's id — the browser compares it with its own (UpdateBanner). */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
}
