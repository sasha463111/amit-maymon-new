import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/customerDocLinks.server';
import { firstName } from '@/lib/customerDocs';
import { shortVehicle } from '@/lib/vehicleLabel';
import { trackStep, type TrackView } from '@/lib/caseTrack';

// The public "מעקב רכב" page (/t/[token]). Server-only on purpose: an export of
// a 'use server' file is a public endpoint. Shows the customer's FIRST name,
// plate, car and stage only — nothing else from the case.

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function caseByTrackToken(token: string): Promise<TrackView | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db
    .from('cases')
    .select('customer_name, painter_status, painter_status_at, opened_at, closed_at, painter_finished_at, treatment_finished_at, track_expires_at, deleted_at, cars(license_plate, vehicle_type, make, model), branches(name)')
    .eq('track_token_hash', hashToken(token))
    .maybeSingle();
  type Car = { license_plate: string | null; vehicle_type: string | null; make: string | null; model: string | null };
  const c = data as {
    customer_name: string | null; painter_status: string | null; painter_status_at: string | null; opened_at: string | null; closed_at: string | null;
    painter_finished_at: string | null; treatment_finished_at: string | null; track_expires_at: string | null; deleted_at: string | null;
    cars: Car | Car[] | null; branches: { name: string } | { name: string }[] | null;
  } | null;
  if (!c || c.deleted_at || !c.track_expires_at || new Date(c.track_expires_at).getTime() < Date.now()) return null;
  const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
  const branch = Array.isArray(c.branches) ? c.branches[0] : c.branches;
  const { step, note } = trackStep(c);
  return {
    firstName: firstName(c.customer_name),
    plate: car?.license_plate ?? null,
    vehicle: car ? shortVehicle(car.vehicle_type, car.make, car.model) || null : null,
    branchName: branch?.name ?? null,
    step,
    note,
    since: c.painter_status_at,
    openedAt: c.opened_at,
  };
}
