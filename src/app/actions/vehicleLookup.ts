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

export async function lookupVehicleByPlate(
  plateNumber: string
): Promise<{ vehicle_type: string | null; vehicle_year: number | null; error?: string }> {
  const digits = plateNumber.replace(/\D/g, '');
  if (!digits) return { vehicle_type: null, vehicle_year: null, error: 'מספר רישוי לא תקין' };

  const url = `${MOT_API_URL}?resource_id=${MOT_RESOURCE_ID}&filters=${encodeURIComponent(
    JSON.stringify({ mispar_rechev: Number(digits) })
  )}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { vehicle_type: null, vehicle_year: null, error: 'שגיאה בפנייה למשרד התחבורה' };

    const data = (await res.json()) as MotResponse;
    const record = data.result?.records?.[0];
    if (!data.success || !record) {
      return { vehicle_type: null, vehicle_year: null, error: 'הרכב לא נמצא ברשימת משרד התחבורה' };
    }

    const vehicle_type = [record.tozeret_nm, record.kinuy_mishari || record.degem_nm]
      .filter(Boolean)
      .join(' ') || null;

    return { vehicle_type, vehicle_year: record.shnat_yitzur ?? null };
  } catch {
    return { vehicle_type: null, vehicle_year: null, error: 'שגיאת תקשורת מול משרד התחבורה' };
  }
}
