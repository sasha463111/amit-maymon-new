import { NextRequest, NextResponse } from 'next/server';

/**
 * Temporary diagnostic: runs the Ministry of Transport lookup FROM THE SERVER
 * and reports what each dataset actually returned.
 *
 * The lookup works from a developer machine but reported "not found" in
 * production for a plate that is definitely in the dataset, so the difference
 * has to be something about the server's network path — latency, a block, or a
 * response shape we don't see locally. This shows which.
 *
 * Protected by CRON_SECRET. Delete once the cause is known.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MOT_API_URL = 'https://data.gov.il/api/3/action/datastore_search';
const DATASETS = [
  { id: '053cea08-09bc-40ec-8f7a-156f0677aff3', label: 'private/commercial' },
  { id: '0866573c-40cd-4ca8-91d2-9dd2d7a492e5', label: 'private cont.' },
  { id: 'cd3acc5c-03c3-4c89-9c54-d40f93c0d790', label: 'heavy 3.5t+' },
];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const plate = Number((req.nextUrl.searchParams.get('plate') ?? '').replace(/\D/g, ''));
  if (!plate) return NextResponse.json({ error: 'plate required' }, { status: 400 });

  const results = [];
  for (const d of DATASETS) {
    const url = `${MOT_API_URL}?resource_id=${d.id}&filters=${encodeURIComponent(JSON.stringify({ mispar_rechev: plate }))}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      const ms = Date.now() - t0;
      const bodyText = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(bodyText); } catch { /* not json */ }
      const p = parsed as { success?: boolean; result?: { records?: unknown[] } } | null;
      results.push({
        dataset: d.label,
        httpStatus: res.status,
        ms,
        success: p?.success ?? null,
        recordCount: p?.result?.records?.length ?? null,
        firstRecord: p?.result?.records?.[0] ?? null,
        // If it isn't JSON, the first part of the body usually explains why
        // (a block page, a WAF challenge, an HTML error).
        bodyPreview: parsed ? undefined : bodyText.slice(0, 400),
      });
    } catch (e) {
      results.push({
        dataset: d.label,
        ms: Date.now() - t0,
        threw: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }

  return NextResponse.json({
    plate,
    region: process.env.VERCEL_REGION ?? 'unknown',
    results,
  });
}
