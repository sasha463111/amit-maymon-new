-- Migration: Populate insurance_branch_mapping with all combinations
-- Decision: All insurance companies work with both branches (Netivot + Ashkelon)
-- This enables branch filtering to show all options regardless of insurance selection

WITH branches AS (
  SELECT id, name FROM public.branches WHERE name IN ('NETIVOT', 'ASHKELON')
),
insurance_list AS (
  SELECT unnest(ARRAY[
    'מנורה מבטחים',
    'הראל ביטוח',
    'כלל ביטוח',
    'הפניקס',
    'איילון',
    'מגדל ביטוח',
    'שלמה רשת מוסכים',
    'ביטוח ישיר',
    'AIG',
    'אנקור',
    'הכשרה ביטוח',
    'אחר'
  ]) as company
)
INSERT INTO public.insurance_branch_mapping (insurance_company, branch_id)
SELECT company, b.id
FROM insurance_list, branches b
ON CONFLICT (insurance_company, branch_id) DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('20260903_populate_insurance_branch_mapping.sql') ON CONFLICT (filename) DO NOTHING;
