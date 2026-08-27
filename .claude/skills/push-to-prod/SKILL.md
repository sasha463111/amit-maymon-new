---
name: push-to-prod
description: Use when the user wants to push/ship/deploy local changes in the amit-maymon-new (tehila-bodyshop-crm) repo — commits and pushes directly to `main`, the live production branch. A push to `main` auto-deploys both production Vercel projects via Vercel's native Git integration. Triggers on "push my changes", "ship this", "deploy to prod", "push to main".
---

# Push to prod (amit-maymon-new)

## Current state (verified 2026-08-27 — supersedes any earlier version of this file)

- **`main` is the live production branch.** Push directly to `origin/main`.
- Vercel's **native Git integration** auto-deploys on every push to `main` — no manual `vercel --prod` step, no GitHub Action. Evidence: commit `1ac3d0b` (authored by the repo owner, sasha463111) removed the old GitHub Actions deploy workflow specifically because it was redundant — it used a stale token and always showed a false red X even though the native integration had already deployed successfully.
- `claude/jovial-noether-550b34` is **not** the live branch. It was merged into `main`, and `main` is now ahead of it. If you see older guidance (including a previous version of this file, or a project skill) saying `claude/jovial-noether-550b34` is production and `main` should never be pushed to — that's stale. Don't follow it without checking current branch state first (`git log --oneline -5` on both, or ask the user).
- Pushing straight to `main` is the actual normal working pattern here — both the repo owner's and other contributors' commits land on `main` directly and deploy without incident. Don't withhold a push to `main` as if it were unusual or risky by default; it's the established flow.
- **Production is two separate Vercel projects sharing one Supabase database**: `amit-maymon-new` and `amit-maymon-new-iyub`. Both are connected via native Git integration to this same repo, so a single push to `main` deploys both — you don't need to trigger them separately.
- **Database migrations are a fully separate, manual step.** Nothing under `src/db/migrations/` is applied by git push or by a Vercel deploy. If the change includes a new migration file, say so explicitly and tell the user which file needs to be run by hand in the Supabase SQL Editor before the deployed code will actually work — don't imply the push handled it.
- There's a `SUPABASE_MIGRATION_GUIDE.md` in the repo root describing a *possible future* move of the whole Supabase project to `eu-central-1` (Frankfurt). As of this writing that hasn't happened — production still runs on the original project (`yhanmyvolpeiuxspcxmk`). Don't assume it's in progress; if it's relevant to what you're doing, check with the user.

## Steps

1. **Check current state**
   - `git status` — if there are no changes to commit and no local commits ahead of `origin/main`, stop and tell the user there's nothing to push.
   - `git branch --show-current` — if not on `main`, either the user wants a feature-branch/PR flow (fine, ask which) or — for a routine fix they've already asked to ship — merge/rebase onto `main` and push there. Both patterns exist in this repo's history; a PR is not mandatory.

2. **Commit**
   - Stage relevant files (avoid committing stray artifacts like `dev.log`, `.env.local`, `node_modules`, `tsconfig.tsbuildinfo` churn).
   - Write a commit message describing the actual change, ending with:
     ```
     Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
     ```
   - Run `npx tsc --noEmit` (and ideally `npm run build`) before committing — this repo has no CI gate catching type errors before deploy.

3. **Push**
   ```
   git push origin main
   ```
   That's it — this alone triggers the production deploy on both Vercel projects. No separate deploy command needed unless you're additionally deploying to an unrelated personal/non-git-connected Vercel project.

4. **If the change includes a migration**
   - Tell the user explicitly which file(s) under `src/db/migrations/` still need to be run manually in the Supabase SQL Editor. This step is easy to forget precisely because the git push "just works" for code — the DB doesn't follow along.

5. **Use judgment on confirming before pushing**, same as any production deploy: for a small, well-tested fix the user already asked to ship, push directly — that's the normal flow here. For something large, risky, or ambiguous, or if you're not confident the user meant "push it now" vs. "here's what I'd change," confirm first. This repo has no staging environment — `main` is production.

## Local dev server (not production)

If the user just wants to *see* their latest change locally (as opposed to deploying), that's separate from this skill: the Next.js dev server (`npm run dev`) hot-reloads automatically on file save — no push needed. Only use this skill when they actually want the change shipped to production.
