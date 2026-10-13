-- Speed measurement (2026-10-13, Tomer: find what makes it slow for each
-- employee). One row per page load / screen change / bell load, posted by the
-- browser to /api/perf. No personal data: role + normalized path + timings.
-- Server-only (RLS on, no policies). Drop the table when the investigation ends.
CREATE TABLE IF NOT EXISTS public.perf_samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  role text,
  kind text NOT NULL,          -- 'load' | 'nav' | 'bell'
  path text,                   -- /cases/:id …
  ms integer NOT NULL,         -- total duration
  ttfb integer,                -- 'load': server response time
  net text,                    -- effectiveType (4g/3g…)
  rtt integer,                 -- browser-estimated round trip ms
  mobile boolean
);
CREATE INDEX IF NOT EXISTS perf_samples_at_idx ON public.perf_samples (at);
ALTER TABLE public.perf_samples ENABLE ROW LEVEL SECURITY;
