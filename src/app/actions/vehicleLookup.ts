'use server';

// Israel Ministry of Transport open datasets.
//
// A plate can live in any one of these, and they are separate datasets — not
// one searchable index. Searching only the first is why heavy vehicles came
// back as "not found": an IVECO 50C18 at 5,000 kg is over the 3.5-ton cut-off
// of the private/commercial dataset and only appears in the heavy one.
//
// Ordered by how often the bodyshop actually sees them, and queried in order,
// so the common case still costs a single request.
const MOT_API_URL = 'https://data.gov.il/api/3/action/datastore_search';

const MOT_DATASETS = [
  // Private + commercial up to 3.5t — the overwhelming majority of cases.
  { id: '053cea08-09bc-40ec-8f7a-156f0677aff3', label: 'private/commercial' },
  // Same dataset, continuation resource (it is split by size, not by type).
  { id: '0866573c-40cd-4ca8-91d2-9dd2d7a492e5', label: 'private/commercial cont.' },
  // Over 3.5t and vehicles with no model code — trucks, minibuses, buses.
  { id: 'cd3acc5c-03c3-4c89-9c54-d40f93c0d790', label: 'heavy (over 3.5t)' },
] as const;

interface MotRecord {
  mispar_rechev: number;
  tozeret_nm?: string;
  // Present in the light dataset; absent in the heavy one, which only carries
  // degem_nm — hence the fallback where the type string is built.
  kinuy_mishari?: string;
  degem_nm?: string;
  shnat_yitzur?: number;
}

interface MotResponse {
  success: boolean;
  result?: { records: MotRecord[] };
}

// Sleep helper for retries
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LookupOutcome =
  | { kind: 'found'; record: MotRecord }
  | { kind: 'absent' }          // dataset answered, plate simply isn't in it
  | { kind: 'unreachable' };    // network/timeout/bad status — says nothing

/**
 * Query ONE dataset, with 2 retries on transport failure.
 *
 * "absent" and "unreachable" are deliberately distinct: an absent plate means
 * keep looking in the next dataset, while an unreachable one means we cannot
 * conclude anything and must not report "vehicle not found" — that would blame
 * the user's plate for our outage.
 */
async function queryDataset(resourceId: string, plate: number): Promise<LookupOutcome> {
  const url = `${MOT_API_URL}?resource_id=${resourceId}&filters=${encodeURIComponent(
    JSON.stringify({ mispar_rechev: plate })
  )}`;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        if (attempt < maxRetries) {
          await sleep(1000 * (attempt + 1)); // 1s, then 2s
          continue;
        }
        return { kind: 'unreachable' };
      }

      const data = (await res.json()) as MotResponse;
      const record = data.result?.records?.[0];
      if (!data.success) return { kind: 'unreachable' };
      return record ? { kind: 'found', record } : { kind: 'absent' };
    } catch {
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return { kind: 'unreachable' };
    }
  }
  return { kind: 'unreachable' };
}

export async function lookupVehicleByPlate(
  plateNumber: string
): Promise<{ vehicle_type: string | null; vehicle_year: number | null; error?: string }> {
  const digits = plateNumber.replace(/\D/g, '');
  if (!digits) return { vehicle_type: null, vehicle_year: null, error: 'מספר רישוי לא תקין' };

  const plate = Number(digits);
  let anyDatasetUnreachable = false;

  for (const dataset of MOT_DATASETS) {
    const outcome = await queryDataset(dataset.id, plate);

    if (outcome.kind === 'found') {
      const { record } = outcome;
      // The heavy dataset has no kinuy_mishari (commercial name), only degem_nm.
      const vehicle_type =
        [record.tozeret_nm, record.kinuy_mishari || record.degem_nm].filter(Boolean).join(' ') || null;
      return { vehicle_type, vehicle_year: record.shnat_yitzur ?? null };
    }

    if (outcome.kind === 'unreachable') anyDatasetUnreachable = true;
    // 'absent' → fall through to the next dataset
  }

  // Only claim the vehicle doesn't exist if every dataset actually answered.
  return {
    vehicle_type: null,
    vehicle_year: null,
    error: anyDatasetUnreachable
      ? 'שגיאת תקשורת מול משרד התחבורה'
      : 'הרכב לא נמצא ברשימות משרד התחבורה',
  };
}
