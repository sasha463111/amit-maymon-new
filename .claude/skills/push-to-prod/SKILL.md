---
name: push-to-prod
description: Use when the user wants to push/ship/deploy local changes in the amit-maymon-new (tehila-bodyshop-crm) repo — commits and pushes directly to `main`, the live production branch. A push to `main` auto-deploys both production Vercel projects via Vercel's native Git integration. Runs the full pipeline — secret guard, build, DB backup, push, migrations, wait for Vercel READY, smoke check, docs, one-line report. Triggers on "push my changes", "ship this", "deploy to prod", "push to main", "דחוף לפרודקשן", "תעלה לפרודקשן", and on "דחפת לפרודקשן?" / "זה עלה?" (answer by checking, not from memory).
---

# Push to prod (amit-maymon-new)

## Current state (verified 2026-08-27 — supersedes any earlier version of this file)

- **`main` is the live production branch.**
- ⚠️ **TWO REMOTES EXIST, AND ONLY ONE DEPLOYS.** This is the trap in this repo:

  | remote | URL | deploys? |
  |---|---|---|
  | `origin` | `github.com/sasha463111/amit-maymon-new` | ❌ no |
  | `tomer` | `github.com/tdavidyan85/amit-maymon-new` | ✅ **production** |

  `main` tracks `origin`, so a plain `git push` succeeds and deploys **nothing** —
  no error, no warning. On 2026-09-25 this was found after **20 commits**: the
  site had served code from 17.09 for over a week while database migrations were
  applied live, leaving old code against a new schema.

  `origin` is now configured to push to BOTH (`git remote set-url --add --push`),
  so `git push origin main` reaches production. That config is LOCAL — it does
  not travel with the repo. On any other machine, re-apply it or push to `tomer`
  explicitly.

  **Always verify after pushing:** `./scripts/check-deploy-remote.sh`
- Vercel's **native Git integration** auto-deploys on every push to `main` — no manual `vercel --prod` step, no GitHub Action. Evidence: commit `1ac3d0b` (authored by the repo owner, sasha463111) removed the old GitHub Actions deploy workflow specifically because it was redundant — it used a stale token and always showed a false red X even though the native integration had already deployed successfully.
- `claude/jovial-noether-550b34` is **not** the live branch. It was merged into `main`, and `main` is now ahead of it. If you see older guidance (including a previous version of this file, or a project skill) saying `claude/jovial-noether-550b34` is production and `main` should never be pushed to — that's stale. Don't follow it without checking current branch state first (`git log --oneline -5` on both, or ask the user).
- Pushing straight to `main` is the actual normal working pattern here — both the repo owner's and other contributors' commits land on `main` directly and deploy without incident. Don't withhold a push to `main` as if it were unusual or risky by default; it's the established flow.
- **Production is ONE Vercel project**: `amit-maymon-new` (team `davit7`), served at both
  `amit-maymon-new.vercel.app` and `amit-maymon-new-psi.vercel.app`.
  (Corrected 2026-09-28: an earlier version of this file listed a second project,
  `amit-maymon-new-iyub`. It no longer exists — `vercel project ls` shows one
  project and `vercel teams ls` shows one team. Don't go looking for a second
  deploy target.)
- **Database migrations are a fully separate, manual step.** Nothing under
  `supabase/migrations/` is applied by git push or by a Vercel deploy. Apply them
  with `npx supabase db push --linked`, and say explicitly when a change needs it —
  don't imply the push handled it.
  (Note: `src/db/migrations/` is DEAD — 49 legacy files from before the Supabase
  CLI, referenced nowhere in application code. The live directory is
  `supabase/migrations/`. See SYSTEM_OVERVIEW.md section 9.2.)
- There's a `SUPABASE_MIGRATION_GUIDE.md` in the repo root describing a *possible future* move of the whole Supabase project to `eu-central-1` (Frankfurt). As of this writing that hasn't happened — production still runs on the original project (`yhanmyvolpeiuxspcxmk`). Don't assume it's in progress; if it's relevant to what you're doing, check with the user.

## Steps — run the whole pipeline without stopping to ask

Tomer: "תפסיק לשאול אותי כל הזמן, זה כבר נהיה מטרד, הכל אמור להיות אוטומטי". He asked
"דחפת לפרודקשן?" 15+ times because pushes ended without a clear confirmation. So:
when he asks to ship (or `triage-feedback` work is approved), run every step below to the end
and finish with the one-line report. Don't ask "לדחוף?" for a change he already asked for.
Stop and ask only for something large/risky that he hasn't approved, or a destructive DB change
(DROP/DELETE/column removal) — migration 046 deleted data once.

1. **Check state**
   - `git status` / `git log tomer/main..main` — nothing to ship → say so and stop.
   - Must be on `main` (see "Current state" above).

2. **Secret guard (blocking)** — never commit `.env*`, `.backups/`, `*.env`, SQL dumps, or any
   file containing a password/key. The repos on GitHub are **PUBLIC**. Check
   `git diff --cached --name-only` and grep the staged diff for `KEY=|PASSWORD|SECRET|service_role`.
   Anything matching → unstage it and tell Tomer.

3. **Build gate** — `npx tsc --noEmit` and `npm run build`. Fix failures before going further
   (this is what the `deploy-validator` agent's auto-fix patterns are for).

4. **Backup** (standing rule: "לפני שעושים פוש לפרודקשן חייב ליצור גיבוי"; also before
   replacing env vars/keys — back up the old values first).
   - Primary: `npx supabase db dump --linked --data-only -f C:/Backups/CRM/pre-push_<YYYYMMDD_HHmm>.sql`
     plus a schema dump to `..._schema.sql` (needs Docker running).
   - Fallback: `gh workflow run daily-backup.yml -R tdavidyan85/amit-maymon-new`, then wait for the
     run to succeed (`gh run watch`).
   - Backups go to `C:/Backups/CRM`, **never inside the repo**.
   - `SqlBackup/backup-before-push.ps1` is interactive (Read-Host) — don't use it from Claude.
   - Backup failed both ways → do not push; tell Tomer why.

5. **Commit + push** — message describes the change, with the session's Co-Authored-By line.
   `git push origin main` (pushes to both remotes), then `./scripts/check-deploy-remote.sh` must
   print "production is up to date".

6. **Migrations** — if `supabase/migrations/` has new files: `npx supabase db push --linked`
   after the backup, then verify with a read query that the change landed and no data was lost
   (row counts before/after on touched tables). If the CLI can't apply it, give Tomer the exact
   SQL for the SQL Editor and say clearly the push is waiting on it.

7. **Wait for Vercel** — Vercel MCP `list_deployments` (project `amit-maymon-new`, team `davit7`):
   find the deployment whose commit SHA = the pushed HEAD and poll until READY or ERROR.
   - ERROR → `get_deployment` build logs → fix → back to step 3. Max 3 rounds, then report.
   - No deployment for that SHA after ~3 min → the webhook didn't fire; check the remote, don't
     tell Tomer "it's live".

8. **Smoke check** — open `https://amit-maymon-new-psi.vercel.app` and confirm the changed
   screen shows the change. For a user-facing bug fix, run the `repro-as-user` skill.

9. **Docs** — standing rule: every prod push updates the affected .md files (CLAUDE.md,
   AGENTS.md, BUSINESS_PROCESS.md, agent docs) in the same push.

10. **Report — one line, always:**
    `✅ בפרודקשן – קומיט <sha> – <מה עלה> – גיבוי: <file> – מיגרציות: <none/applied>`
    or `🔴 לא עלה – <why> – <what's needed>`.
    Then offer the `staff-whatsapp` message if staff need to know.

## Local dev server (not production)

If the user just wants to *see* their latest change locally (as opposed to deploying), that's separate from this skill: the Next.js dev server (`npm run dev`) hot-reloads automatically on file save — no push needed. Only use this skill when they actually want the change shipped to production.
