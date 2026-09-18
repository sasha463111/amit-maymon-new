-- Enable realtime on profiles so permission changes propagate live
--
-- src/components/RealtimeProfileSync.tsx subscribes to UPDATE on public.profiles
-- and reloads the page when the CURRENT user's own row changes, so a role or
-- branch change made by the CEO takes effect immediately instead of waiting for
-- the user to log out and back in.
--
-- The subscription was never receiving anything: the supabase_realtime
-- publication contained only `notifications`, so no profiles change was ever
-- broadcast. The component has been shipped and inert since it was added.
--
-- RLS still applies to realtime: a client only receives change events for rows
-- its own profiles_select policy allows it to read (own row, active colleagues,
-- or everything for CEO). Enabling this does not widen visibility beyond what
-- the same user could already query directly.

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
