---
name: repro-as-user
description: Use when a Tehila staff member reports something doesn't work for them ("לא נותן לאילנית לפתוח הפנייה", "לא מעלה קובץ", "לא נותן לבחור סניף") or Tomer says "תתחבר בתור X ותבדוק בעצמך", "תדמה שאתה המשתמש", "תבדוק לפני שאני שולח לה" — and BEFORE ever telling Tomer a user-facing bug is fixed. Reproduces the exact flow as that real user in production, with evidence.
---

# Reproduce as the real user (Tehila CRM)

## Why this exists

The file-upload bug for Ilanit (Sept 14–17) was declared "fixed" several times while she kept
getting the same error. The QA agents reported PASS because they only checked that the upload
*input exists* — they never uploaded a file. Tomer: "אי אפשר לעבוד ככה שאתה אומר שתיקנת וזה לא
באמת", "אל תהיה בטוח ב-90%, תבדוק ותהיה בטוח ב-100%".

**Rule: "fixed" means the exact action the user did now succeeds, end to end, as that user, on
production — with evidence. Anything less is "pushed, not verified".**

## Steps

1. **Pin down the exact scenario.** Which user (email/role), which page, which button, which
   branch, with/without file, mobile/desktop. If Tomer forwarded a screenshot, read the error text
   off it. Don't ask Tomer what you can get from the screenshot or the logs.

2. **Confirm production is running the code you think.** `./scripts/check-deploy-remote.sh` and
   the latest READY deployment on Vercel (project `amit-maymon-new`, team `davit7`). Reproducing
   against an old build wastes everyone's time.

3. **Log in as that user** with Playwright on `https://amit-maymon-new-psi.vercel.app`.
   Test accounts and the shared login are in the `qa-*` agent files / `.env.local`.
   Tomer authorized logging in to the staff accounts for testing.

4. **Do the real action, not a presence check.** Actually click "צור הפנייה", actually attach a
   real small file (create a 1-page PDF/PNG in the scratchpad), actually save, then reload and
   confirm it persisted. Use a clearly marked test record (`בדיקה – Claude – DD/MM`) and
   delete/soft-delete it afterwards. Never touch real customer records.

5. **Collect evidence on failure and success:**
   - screenshot of the final state,
   - browser console errors + failed network requests (`browser_network_requests`),
   - Supabase logs for the same minute (`query_logs`: api, postgres, storage) — RLS denials and
     storage policy errors show up there, not in the UI.

6. **If it fails:** root cause via the `systematic-debugging` skill, fix, ship with `push-to-prod`,
   then **repeat steps 3–5 from scratch** on the new deployment. Also run the same action as
   every other role that should be able to do it — permission fixes for one role have broken
   another before.

7. **Report to Tomer:** what was tested, as whom, result, evidence. Only now may the
   `staff-whatsapp` message say ✅.

## Regression net

Every bug found this way becomes a step in the relevant `qa-*-tester` agent's checklist as a
*real action* (upload a file, create and reload) — not "upload input present".
