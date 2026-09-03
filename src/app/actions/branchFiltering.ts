'use server';

import { createClient } from '@/lib/supabase/server';

export interface Branch {
  id: string;
  name: string;
}

/**
 * Get all branches, optionally filtered by insurance company.
 * If insurance_company is provided, returns only branches that support that company.
 * If not provided or empty, returns all branches.
 *
 * @param insurance_company - Insurance company name (or empty string for all)
 * @returns Array of branches
 */
export async function getFilteredBranches(insurance_company?: string): Promise<Branch[]> {
  const supabase = await createClient();

  if (!insurance_company || insurance_company.trim() === '') {
    // No filter — return all branches
    const { data } = await supabase
      .from('branches')
      .select('id, name')
      .order('name');
    return (data ?? []) as Branch[];
  }

  // Filter by insurance company using the mapping table
  const { data } = await supabase
    .from('insurance_branch_mapping')
    .select('branch_id')
    .eq('insurance_company', insurance_company);

  if (!data || data.length === 0) {
    // No mapping found — return all branches as fallback
    const { data: allBranches } = await supabase
      .from('branches')
      .select('id, name')
      .order('name');
    return (allBranches ?? []) as Branch[];
  }

  const branchIds = (data as { branch_id: string }[]).map((r) => r.branch_id);

  // Get the actual branch details
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .in('id', branchIds)
    .order('name');

  return (branches ?? []) as Branch[];
}
