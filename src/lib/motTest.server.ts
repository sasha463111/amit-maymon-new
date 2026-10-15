import 'server-only';

// The vehicle-licence ("טסט") expiry from the Ministry of Transport open
// registry (data.gov.il) — for the loaner fleet (Tomer, 15/10). Same datasets
// as actions/vehicleLookup.ts. Null when the plate is not found / the API is
// down — callers keep what they have.

const API = 'https://data.gov.il/api/3/action/datastore_search';
const DATASETS = [
  '053cea08-09bc-40ec-8f7a-156f0677aff3', // private / commercial
  '0866573c-40cd-4ca8-91d2-9dd2d7a492e5', // private / commercial (cont.)
  'cd3acc5c-03c3-4c89-9c54-d40f93c0d790', // heavy (over 3.5t)
];

/** "YYYY-MM-DD" or null. */
export async function fetchTestUntil(plate: string): Promise<string | null> {
  const n = Number(plate.replace(/\D/g, ''));
  if (!n) return null;
  for (const id of DATASETS) {
    try {
      const url = `${API}?resource_id=${id}&filters=${encodeURIComponent(JSON.stringify({ mispar_rechev: n }))}`;
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const j = (await res.json()) as { result?: { records?: { tokef_dt?: string | null }[] } };
      const d = j.result?.records?.[0]?.tokef_dt;
      if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    } catch {
      /* try the next dataset */
    }
  }
  return null;
}
