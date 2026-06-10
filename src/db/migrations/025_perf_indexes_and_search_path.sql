-- 025: Performance — covering indexes on hot-path foreign keys + pin remaining
-- SECURITY DEFINER search_paths (from advisor findings).

ALTER FUNCTION public.get_my_branch_id() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;

CREATE INDEX IF NOT EXISTS idx_notifications_case_id ON public.notifications(case_id);
CREATE INDEX IF NOT EXISTS idx_notifications_triggered_by ON public.notifications(triggered_by);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON public.audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_case_workflow_steps_completed_by ON public.case_workflow_steps(completed_by);
CREATE INDEX IF NOT EXISTS idx_ceo_approvals_decided_by ON public.ceo_approvals(decided_by);
CREATE INDEX IF NOT EXISTS idx_bodywork_extras_created_by ON public.bodywork_extras(created_by);
CREATE INDEX IF NOT EXISTS idx_painter_requests_created_by ON public.painter_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_case_documents_uploaded_by ON public.case_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_cases_created_by ON public.cases(created_by);
CREATE INDEX IF NOT EXISTS idx_cases_deleted_by ON public.cases(deleted_by);
