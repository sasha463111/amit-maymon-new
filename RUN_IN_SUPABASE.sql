-- ============================================================
-- הרץ את הקובץ הזה ב-Supabase: SQL Editor → New query → הדבק → Run
-- ============================================================

-- אם הפוליסיות כבר קיימות, קודם מוחקים (אפשר להריץ כמה פעמים בלי שגיאה)
DROP POLICY IF EXISTS case_workflow_runs_insert_creator ON case_workflow_runs;
DROP POLICY IF EXISTS case_workflow_runs_update_ceo ON case_workflow_runs;
DROP POLICY IF EXISTS case_workflow_steps_update_ceo ON case_workflow_steps;

-- case_workflow_runs: INSERT כשהתיק נוצר על ידי המשתמש (תיקון פתיחת תיק)
CREATE POLICY case_workflow_runs_insert_creator ON case_workflow_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    case_id IN (SELECT id FROM cases WHERE created_by = auth.uid())
  );

-- case_workflow_runs: UPDATE למנכ"ל
CREATE POLICY case_workflow_runs_update_ceo ON case_workflow_runs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));

-- case_workflow_steps: UPDATE למנכ"ל (סימון שלב כבוצע)
CREATE POLICY case_workflow_steps_update_ceo ON case_workflow_steps
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));
