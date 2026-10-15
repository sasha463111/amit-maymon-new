-- Security review (16/10): trigger functions are SECURITY DEFINER and were
-- callable directly through the API (/rest/v1/rpc/...), some even without
-- signing in. A trigger fires regardless of EXECUTE (dispatch_ceo_push already
-- runs like this), so revoking only closes the direct call.
revoke execute on function public.close_notifications_on_approval() from public, anon, authenticated;
revoke execute on function public.close_notifications_on_case_progress() from public, anon, authenticated;
revoke execute on function public.close_notifications_on_painter_request() from public, anon, authenticated;
revoke execute on function public.drop_irrelevant_notification() from public, anon, authenticated;
revoke execute on function public.fanout_notifications_to_ceos() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- A signed-in helper; nobody signed out needs it.
revoke execute on function public.can_track_part_returns() from public, anon;
grant execute on function public.can_track_part_returns() to authenticated;
