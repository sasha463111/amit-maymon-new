import { createClient as createServiceClient } from '@supabase/supabase-js';

// "יועץ מטפל" for the painters (Amit, 2026-10-11: painters should see which
// service advisor handled the case, so they know whom to ask). There is no
// assignment field — cases are opened by the office — so it is derived from
// who completed the case's professional steps: the SERVICE_ADVISOR /
// SERVICE_MANAGER with the most steps first. No steps yet → no advisor.
//
// Read with the service client because painters can't read other users'
// profiles. Callers must pass only case ids the user is allowed to see
// (i.e. ids from a query that already went through RLS).

const ADVISOR_ROLES = new Set(['SERVICE_ADVISOR', 'SERVICE_MANAGER']);

export async function getCaseAdvisors(caseIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || caseIds.length === 0) return result;
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: runs } = await db
    .from('case_workflow_runs')
    .select('id, case_id')
    .eq('workflow_type', 'PROFESSIONAL')
    .in('case_id', caseIds);
  const caseByRun = new Map(((runs ?? []) as { id: string; case_id: string }[]).map((r) => [r.id, r.case_id]));
  if (caseByRun.size === 0) return result;

  const { data: steps } = await db
    .from('case_workflow_steps')
    .select('run_id, completed_by')
    .eq('state', 'DONE')
    .neq('step_key', 'OPEN_CASE')
    .not('completed_by', 'is', null)
    .in('run_id', Array.from(caseByRun.keys()));
  const stepRows = (steps ?? []) as { run_id: string; completed_by: string }[];
  const people = Array.from(new Set(stepRows.map((s) => s.completed_by)));
  if (people.length === 0) return result;

  const { data: profiles } = await db.from('profiles').select('id, full_name, role').in('id', people);
  const advisorName = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; role: string }[])
      .filter((p) => ADVISOR_ROLES.has(p.role))
      .map((p) => [p.id, p.full_name || '—']),
  );

  const counts = new Map<string, Map<string, number>>();
  for (const s of stepRows) {
    const caseId = caseByRun.get(s.run_id);
    const name = advisorName.get(s.completed_by);
    if (!caseId || !name) continue;
    const m = counts.get(caseId) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    counts.set(caseId, m);
  }
  for (const [caseId, m] of Array.from(counts.entries())) {
    result.set(caseId, Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([n]) => n));
  }
  return result;
}
