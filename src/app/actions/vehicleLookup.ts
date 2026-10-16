'use server';

import { createClient } from '@/lib/supabase/server';
import { lookupVehicle } from '@/lib/vehicleLookup.server';

// The Ministry of Transport lookup for the browser (case / referral forms).
// Security review (16/10): a 'use server' export is a public endpoint — signed-in
// staff only, so our server isn't an open proxy. The lookup itself lives in
// src/lib/vehicleLookup.server.ts (also used server-side without a session).
export async function lookupVehicleByPlate(plateNumber: string): Promise<{ vehicle_type: string | null; vehicle_year: number | null; error?: string }> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { vehicle_type: null, vehicle_year: null, error: 'לא מחובר' };
  return lookupVehicle(plateNumber);
}
