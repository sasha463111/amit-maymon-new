import { createClient as createServiceClient } from '@supabase/supabase-js';

// "יועץ מטפל" for the painters (Amit, 2026-10-11: painters should see which
// service advisor handled the case, so they know whom to ask). There is no
// assignment field — cases are opened by the office, which doesn't know who is
// free — so it is derived: the FIRST service advisor / manager to complete a
// professional step owns the case (Amit: "מי שייגע בתיק ראשון שהוא ישוייך").
// One name, and it never changes after that. No steps yet → no advisor.
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
    .select('run_id, completed_by, completed_at')
    .eq('state', 'DONE')
    .neq('step_key', 'OPEN_CASE')
    .not('completed_by', 'is', null)
    .in('run_id', Array.from(caseByRun.keys()));
  const stepRows = (steps ?? []) as { run_id: string; completed_by: string; completed_at: string | null }[];
  const people = Array.from(new Set(stepRows.map((s) => s.completed_by)));
  if (people.length === 0) return result;

  const { data: profiles } = await db.from('profiles').select('id, full_name, role').in('id', people);
  const advisorName = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; role: string }[])
      .filter((p) => ADVISOR_ROLES.has(p.role))
      .map((p) => [p.id, p.full_name || '—']),
  );

  // Earliest advisor step per case wins.
  const first = new Map<string, { at: string; name: string }>();
  for (const st of stepRows) {
    const caseId = caseByRun.get(st.run_id);
    const name = advisorName.get(st.completed_by);
    if (!caseId || !name) continue;
    const at = st.completed_at ?? '9999';
    const cur = first.get(caseId);
    if (!cur || at < cur.at) first.set(caseId, { at, name });
  }
  for (const [caseId, f] of Array.from(first.entries())) result.set(caseId, [f.name]);
  return result;
}
