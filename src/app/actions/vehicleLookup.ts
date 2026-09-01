'use server';

// Israel Ministry of Transport open dataset — private/commercial vehicles up to 3.5 ton.
// https://data.gov.il/dataset/private-and-commercial-vehicles
const MOT_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3';
const MOT_API_URL = 'https://data.gov.il/api/3/action/datastore_search';

interface MotRecord {
  mispar_rechev: number;
  tozeret_nm?: string;
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

export async function lookupVehicleByPlate(
  plateNumber: string
): Promise<{ vehicle_type: string | null; vehicle_year: number | null; error?: string }> {
  const digits = plateNumber.replace(/\D/g, '');
  if (!digits) return { vehicle_type: null, vehicle_year: null, error: 'מספר רישוי לא תקין' };

  const url = `${MOT_API_URL}?resource_id=${MOT_RESOURCE_ID}&filters=${encodeURIComponent(
    JSON.stringify({ mispar_rechev: Number(digits) })
  )}`;

  // Retry logic: 2 attempts with exponential backoff (1s, 2s)
  const maxRetries = 2;
  let lastError = 'שגיאת תקשורת מול משרד התחבורה';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        lastError = 'שגיאה בפנייה למשרד התחבורה';
        // Don't retry on bad status — move to next attempt
        if (attempt < maxRetries) {
          await sleep(1000 * (attempt + 1)); // 1s, then 2s
          continue;
        }
        return { vehicle_type: null, vehicle_year: null, error: lastError };
      }

      const data = (await res.json()) as MotResponse;
      const record = data.result?.records?.[0];
      if (!data.success || !record) {
        return { vehicle_type: null, vehicle_year: null, error: 'הרכב לא נמצא ברשימת משרד התחבורה' };
      }

      const vehicle_type = [record.tozeret_nm, record.kinuy_mishari || record.degem_nm]
        .filter(Boolean)
        .join(' ') || null;

      return { vehicle_type, vehicle_year: record.shnat_yitzur ?? null };
    } catch (err) {
      lastError = 'שגיאת תקשורת מול משרד התחבורה';
      // Only retry on network/timeout errors
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1)); // 1s, then 2s
        continue;
      }
    }
  }

  return { vehicle_type: null, vehicle_year: null, error: lastError };
}
