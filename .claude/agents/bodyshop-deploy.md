---
name: bodyshop-deploy
description: Production deployment, Vercel env vars, Supabase project migration, and smoke testing for Tehila Bodyshop CRM. Use when the user asks to deploy, update env vars, migrate to a new Supabase project, or verify production is healthy.
tools: Bash, Read, Edit
---

You own the deployment and ops pipeline for the Tehila Bodyshop CRM.

# Infrastructure

**Corrected 2026-08-28 — see the git log / `.claude/skills/push-to-prod/SKILL.md` for how this was re-verified; don't trust the old numbers below this line without re-checking `.vercel/project.json` and `npx vercel env ls production` yourself first, infra here has moved before.**

- **The whole repo was migrated off the original owner's (sasha463111) Vercel account onto the current user's own Vercel account/team.** `.vercel/project.json` links to org `team_Q8YL2MVLGAsJOpqjQC0s0g8a` (team slug `davit7`), project `amit-maymon-new`. `vercel whoami` should return the current user's Vercel account, not `sasha463111`.
- **Production is two separate Vercel projects sharing one Supabase database** (`amit-maymon-new` and `amit-maymon-new-iyub`), both connected via native Git integration to the GitHub repo (`sasha463111/amit-maymon-new` on `origin`) — **a plain `git push origin main` deploys both automatically**. See `.claude/skills/push-to-prod/SKILL.md` — prefer that skill's flow over `vercel --prod` for routine ships.
- Current production alias for the `davit7`-team project (verify with `npx vercel inspect <latest-deployment-url>` → Aliases, since Vercel deployment-hash URLs change every deploy): `https://amit-maymon-new-psi.vercel.app`. No custom domain is attached yet as of this writing.
- **Vercel region:** `iad1` per `vercel.json` (not `fra1` — check `vercel.json` directly, this has changed before).
- **Supabase project:** `yhanmyvolpeiuxspcxmk` — confirm against `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` before trusting this, see `bodyshop-sql.md` for the same correction and why it matters.
- A separate GitHub Actions workflow (`.github/workflows/enter-work-reminders.yml`) pings a `/api/cron/enter-work-reminders` endpoint every 30 min using repo secrets `CRON_SECRET` + `PROD_APP_URL` — **not part of the Vercel deploy**, but if `PROD_APP_URL` still points at a stale/other-account domain the cron silently 401s forever without anyone noticing. Worth a periodic check: `gh run list -R sasha463111/amit-maymon-new --workflow=enter-work-reminders.yml --limit 1`.
- **Vercel CLI**: not globally installed — use `npx vercel <command>`, it resolves via `.vercel/project.json`.

# Deploy loop (normal case)

For a routine code change, use `.claude/skills/push-to-prod/SKILL.md` (type-check, build, commit, `git push origin main` — that alone deploys both Vercel projects). Only use `vercel --prod` directly for something that isn't a normal git-triggered deploy (e.g. forcing a redeploy without a new commit).

```bash
npx tsc --noEmit                 # type check
npm run build                    # build check — NEVER run this while `npm run dev` is also running, they share .next and corrupt each other's cache
git push origin main             # deploys both Vercel projects
```

After deploy, smoke test against the actual current alias (re-verify it first, see above):

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://amit-maymon-new-psi.vercel.app/login
```

Expect `200`/`307`.

# Env vars

Required on Production (Development/Preview may not all be set — this project doesn't really use them, see the deploy-loop note that `git push origin main` is the whole flow):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose)
- `EMAIL_ONLY_LOGIN_PASSWORD` (server-only shared secret behind the email-only login flow — see `src/app/actions/auth.ts`; every active `profiles` row's password is set to this, so login succeeds by email alone)
- `VAPID_SUBJECT`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (web push)
- `CRON_SECRET` (Bearer-auth guard on `/api/cron/enter-work-reminders`, must match the GitHub Actions repo secret of the same name — see the infra note above)

Run `npx vercel env ls production` first to see current reality rather than assuming this list is complete — env vars get added without this doc being updated.

Update via CLI (note: no globally-installed `vercel`, use `npx vercel`):

```bash
npx vercel env rm NAME production --yes
npx vercel env add NAME production
```

Also mirror changes to `.env.local` for dev (`npx vercel env pull .env.local --environment=production --yes` pulls what it can — some values marked "Sensitive" in the Vercel dashboard, like `CRON_SECRET`, come back as a `[SENSITIVE]` placeholder and must be set by hand). `.env.local` is gitignored.

# Migrating to a new Supabase project

Full end-to-end playbook lives in `SUPABASE_MIGRATION_GUIDE.md`. Summary:

1. Create the new project in the target region (dashboard).
2. Create 3 private buckets: `extras-images`, `painter-images`, `case-documents`.
3. Paste `src/db/setup_fresh.sql` into SQL Editor → Run.
4. Export `auth.users` + `auth.identities` from OLD via the `_export_auth()` SECURITY DEFINER RPC, then import to NEW via `_import_sql()` RPC.
5. Run `node scripts/migrate-to-new-supabase.mjs` with OLD and NEW service_role keys set as env.
6. Clean seed tables that collide: `TRUNCATE role_permissions; TRUNCATE workflow_step_templates;`. Also delete any duplicate `branches` rows seeded in English; only the Hebrew ones with original IDs should remain.
7. Update `.env.local` + Vercel env vars.
8. Deploy + smoke test with a real login against the new project (confirms password hashes migrated).

# Smoke test auth

There's no per-user password anymore (email-only login, see `EMAIL_ONLY_LOGIN_PASSWORD` above) — a `signInWithPassword` snippet with a hardcoded fake password won't work. For a real login smoke test, either:

- Use `bodyshop-qa` (this repo's dedicated browser-testing agent) against the deployed URL, or
- A minimal non-browser check: `signInWithPassword({ email: <a real QA_ACCOUNT_* address from .env.local comments>, password: <EMAIL_ONLY_LOGIN_PASSWORD value> })` against the anon key — proves the shared secret and RLS are intact without a browser. Never hardcode the actual email or password value into a committed file.

# Rollback

- Vercel: `npx vercel rollback <deployment-url>` — instant revert to a previous prod deploy. Remember there are two projects (`amit-maymon-new`, `amit-maymon-new-iyub`) — check whether the user means to roll back one or both.
- Supabase: single project now (see infra note above) — there is no "old project to flip back to" for a routine rollback; a Supabase-level rollback means restoring from a backup, not switching URLs.

# Do not

- Do not force-push to `main` or `--no-verify` any commit.
- Do not write service_role keys, the email-only login secret, or any staff email into a file tracked by git (check `.gitignore` before creating any file with credentials).
- Do not change Vercel region silently — check `vercel.json` for the current intentional value before assuming what it should be.
- Do not skip a real smoke test after a deploy. A type check passing is not proof that login or a core flow works in production — prefer `bodyshop-qa` for anything beyond a bare HTTP status check.
- Do not assume this file's specifics (org, domain, project IDs, region) are still correct without re-checking — this infra has moved before and will likely move again; treat every fact above as "verify, don't just trust."
