'use server';

import { createClient } from '@/lib/supabase/server';
import { shortVehicle } from '@/lib/vehicleLabel';

// Case search from the header, for every role (Amit, 2026-10-11: "חיפוש ידני
// לתיקים לפי שם או מספר רכב" — until now he scrolled through all open cases).
// Runs with the user's own session, so RLS limits results to what that user
// may see (own branch, painters' cases, …). Open and closed cases both match.

export type CaseHit = {
  id: string;
  plate: string;
  vehicle: string | null;
  customer: string | null;
  branch: string | null;
  openedAt: string | null;
  closed: boolean;
};

type Row = {
  id: string;
  customer_name: string | null;
  opened_at: string | null;
  created_at: string;
  closed_at: string | null;
  case_key: string | null;
  branches: { name: string } | { name: string }[] | null;
  cars: CarCols | CarCols[] | null;
};
type CarCols = { license_plate: string | null; vehicle_type: string | null; make: string | null; model: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function searchCases(raw: string): Promise<{ hits: CaseHit[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hits: [], error: 'לא מחובר' };

  // LIKE wildcards and PostgREST separators are not search text.
  const q = raw.replace(/[%_,()*\\]/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return { hits: [] };
  const digits = q.replace(/\D/g, '');
  const cols = 'id, customer_name, opened_at, created_at, closed_at, case_key, branches(name), cars!inner(license_plate, vehicle_type, make, model)';

  const queries = [
    supabase.from('cases').select(cols).is('deleted_at', null).ilike('customer_name', `%${q}%`).limit(30),
  ];
  // A plate is digits only (stored without dashes); "12-345-67" still finds it.
  if (digits.length >= 3 && digits.length === q.replace(/[\s-]/g, '').length) {
    queries.push(supabase.from('cases').select(cols).is('deleted_at', null).ilike('cars.license_plate', `%${digits}%`).limit(30));
  }
  const results = await Promise.all(queries);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { hits: [], error: failed.error.message };

  const byId = new Map<string, Row>();
  for (const r of results) for (const row of (r.data ?? []) as Row[]) byId.set(row.id, row);

  const hits = Array.from(byId.values())
    .map((r) => ({
      id: r.id,
      plate: one(r.cars)?.license_plate || r.case_key || '—',
      vehicle: shortVehicle(one(r.cars)?.vehicle_type, one(r.cars)?.make, one(r.cars)?.model) || null,
      customer: r.customer_name,
      branch: one(r.branches)?.name ?? null,
      openedAt: r.opened_at ?? r.created_at,
      closed: !!r.closed_at,
    }))
    // Open cases first, then newest first.
    .sort((a, b) => Number(a.closed) - Number(b.closed) || (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
    .slice(0, 20);
  return { hits };
}
