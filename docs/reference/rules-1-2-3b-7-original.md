# Standing Rules #1, #2, #3b, #7 — הנוסח המקורי

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק).

### 🔴 Standing Rule #1: Autonomous Production Deployment (2026-09-03)

**Policy:** Deploy Validator Agent autonomously deploys to production after successful local build verification. **No manual approval needed.**

**Flow:**
1. Claude makes code changes locally
2. Commits and pushes to BOTH remotes:
   - `origin` (sasha463111/amit-maymon-new) — backup
   - `tomer` (tdavidyan85/amit-maymon-new) — **Vercel watches this**
3. Deploy Validator Agent automatically:
   - Runs `npm run build` locally
   - If ✅ **builds successfully** → Auto-deploys to Vercel production
   - If ❌ **build fails** → Reports error + stops deployment
4. Agent reports all deployments for transparency

**Why this exists:** Manual approval after every build created a bottleneck that defeated the purpose of having autonomous agents.

**Critical details:**
- **Both remotes always:** `git push origin main && git push tomer main`
- **Vercel configuration:** Connected to `tdavidyan85/amit-maymon-new`
- **Build must pass locally** before production deployment
- **No manual "Deploy to production" approval needed**

---

### 🔴 Standing Rule #2: Documentation Sync on Every Production Push (2026-09-01)

**Policy:** Every production push to `main` MUST update the project `.md` files in the SAME commit.

**Files that must sync:**
- `CLAUDE.md` — Technical architecture & implementation notes
- Individual agent documentation files in `.claude/agents/`

**Why this exists:** Drift between code and documentation causes confusion. If the codebase changes, the documentation must change too, or developers (including Claude in future sessions) lose trust and navigate by guessing.

**What counts as a "production change":**
- Code logic changes that affect how features work
- Schema migrations (database changes)
- New features or removed features
- Bug fixes that change observable behavior
- Architecture refactors

**What does NOT require doc updates:**
- Comment-only changes
- Linting/formatting fixes
- Variable renames (internal refactors with no external impact)

---

### 🔴 Standing Rule #3b: Who gets which notification is decided in ONE place — by job (2026-10-11)

**Supersedes the routing table below wherever they differ.** Amit's spec: every person gets only what belongs to their job; what isn't theirs is **not created at all** (not merely hidden).

- **Job = role + office function** (`src/lib/staffJobs.ts`): יועץ/ת שירות, מנהל שירות, **משרד הפניות** (OFFICE + `office_function='REFERRALS'`: אביה, אילנית), **משרד סגירה** (OFFICE + `'CLOSURE'`: אילנה), פחח, מנכ"ל. Chosen in Settings when creating/editing a user — that alone gives a new user the right notifications. Referrals office lands on `/referrals`.
- **The rule** lives in the DB (migration `20261011140000_notifications_by_role.sql`): `notification_kind(type,title)` + `notification_is_relevant(role, office_function, kind)`, enforced by `trg_0_relevant_notifications_only` (BEFORE INSERT → row dropped). Covers every source: app code, cron, the CEO fan-out.

| Job | Gets |
|---|---|
| מנכ"ל | everything |
| יועץ/מנהל שירות | painter requests, personal notes, new case, all case-flow (approvals, rejections, blocked, wash, wheels, extras, closed), entered work, parts arrived |
| משרד הפניות | referral follow-ups (`REFERRAL_FOLLOW_UP`), personal notes |
| משרד סגירה | cases for closure (`READY_FOR_OFFICE` + its reminder), personal notes |
| פחח | entered work, parts arrived, "רכב ממתין לעבודה" reminder, answers to their requests, personal notes |

- **Painter requests in the bell:** stay in "לטיפולי" for every advisor while the request is PENDING (not by read state), tagged "מיועד ל: <יועץ מטפל>"; once handled they move to updates with "✓ טופל".

### 🔴 Standing Rule #7: Push to the Remote That Actually Deploys (2026-09-25)

**Policy:** This repo has TWO remotes. Only one is connected to Vercel. After
every push, verify the deploy remote received it.

```bash
./scripts/check-deploy-remote.sh
```

| remote | URL | deploys? |
|---|---|---|
| `origin` | `github.com/sasha463111/amit-maymon-new` | ❌ no |
| `tomer` | `github.com/tdavidyan85/amit-maymon-new` | ✅ **production** |

`main` tracks `origin`, so a plain `git push` goes to the remote that deploys
**nothing** — and reports success. There is no error, no warning, and the
commit really is pushed. It is simply pushed somewhere Vercel never sees.

**Root Cause:** On 2026-09-25 this was found after **20 commits** had
accumulated. Production had been serving code from 17.09 for over a week while
database migrations were being applied live — so production was running OLD
CODE against a NEW SCHEMA. That is worse than being merely out of date: the
permission matrix, the notification fix and the RLS changes were live in the
database while the code that understood them was not deployed.

It went unnoticed because every signal said success: `git push` reported the
commit, the build passed, and database changes took effect immediately (they
are applied directly, not through Vercel), so parts of the system genuinely did
improve.

**Rules:**

1. **Push to both.** `git remote set-url --add --push origin <both URLs>` makes
   one push reach both. This is LOCAL config — it does not travel with the
   repo, so re-apply it on any new machine.
2. **Verify, don't assume.** Run the script above after pushing. "git push
   succeeded" does not mean "deployed".
3. **Suspect this first** when production behaves like an older build, or when
   a database change works but the matching UI change doesn't.
4. **Never conclude a fix is live** from a successful push alone — the only
   proof is the deploy remote's HEAD matching local, or a Ready deployment in
   Vercel.

**Why two remotes exist:** not established. Do not delete either without
checking with the owner — `origin` may be a collaborator's fork.

