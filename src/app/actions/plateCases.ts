'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { hasPermission } from '@/lib/permissions';

// "פתיחת תיק" (Amit, 2026-10-14): the same car can come back for another
// accident. When a plate already has cases, whoever opens a case is asked
// first — the same event (open the existing case) or a new one (a new case,
// typed from scratch). Looks across all branches (a car may have been fixed
// in the other branch); only users allowed to create cases, and only the
// summary needed for that question.

export type PlateCase = {
  id: string;
  opened_at: string | null;
  event_date: string | null;
  closed: boolean;
  branch_name: string | null;
  claim_number: string | null;
  customer_name: string | null;
  /** Visible to this user (RLS) — can be opened from here. */
  can_open: boolean;
};

export async function lookupCasesByPlate(plateInput: string): Promise<{ cases: PlateCase[] }> {
  const plate = (plateInput ?? '').replace(/\D/g, '');
  if (plate.length < 5) return { cases: [] };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasPermission(supabase, 'create_case'))) return { cases: [] };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { cases: [] };
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: cars } = await db.from('cars').select('id, license_plate').ilike('license_plate', `%${plate.slice(-4)}%`).limit(200);
  const carIds = ((cars ?? []) as { id: string; license_plate: string }[]).filter((c) => c.license_plate.replace(/\D/g, '') === plate).map((c) => c.id);
  if (!carIds.length) return { cases: [] };
  type Row = { id: string; opened_at: string | null; event_date: string | null; closed_at: string | null; claim_number: string | null; customer_name: string | null; branches: { name: string } | { name: string }[] | null };
  const { data } = await db
    .from('cases')
    .select('id, opened_at, event_date, closed_at, claim_number, customer_name, branches(name)')
    .in('car_id', carIds)
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { cases: [] };
  const { data: visible } = await supabase.from('cases').select('id').in('id', rows.map((r) => r.id));
  const canSee = new Set(((visible ?? []) as { id: string }[]).map((v) => v.id));
  return {
    cases: rows.map((r) => ({
      id: r.id,
      opened_at: r.opened_at,
      event_date: r.event_date,
      closed: !!r.closed_at,
      branch_name: (Array.isArray(r.branches) ? r.branches[0] : r.branches)?.name ?? null,
      claim_number: r.claim_number,
      customer_name: r.customer_name,
      can_open: canSee.has(r.id),
    })),
  };
}
