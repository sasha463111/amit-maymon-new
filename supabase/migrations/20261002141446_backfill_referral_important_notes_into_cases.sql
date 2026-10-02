-- Referrals converted before 2026-10-02 did not carry their important_notes
-- into the case (convertReferral now does). Copy them across, same format as
-- the app: header line, the note, then any existing case notes below.
-- Idempotent: skips cases whose notes already contain the referral's note.
UPDATE public.cases c
SET notes = '⚠️ הערות חשובות מההפנייה:' || E'\n' || btrim(r.important_notes)
            || CASE WHEN coalesce(btrim(c.notes), '') <> '' THEN E'\n\n' || btrim(c.notes) ELSE '' END
FROM public.referrals r
WHERE r.case_id = c.id
  AND r.status = 'CONVERTED'
  AND coalesce(btrim(r.important_notes), '') <> ''
  AND position(btrim(r.important_notes) IN coalesce(c.notes, '')) = 0;
