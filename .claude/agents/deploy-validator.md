# Deploy Validator Agent

**Purpose:** Automatically verify production deployments after git push. Catch and fix build errors before they reach Vercel.

**Trigger:** After each `git push tomer main` to amit-maymon-new

**Responsibilities:**

## 1. Post-Push Status Check
- Run `npm run build` to verify compilation
- Parse build output for errors
- Report status: ✅ SUCCESS or 🔴 ERROR

## 2. Error Analysis
- Identify error type:
  - TypeScript errors (type mismatches)
  - Supabase type errors (.catch() chains, missing `as any`)
  - Import/export issues
  - Syntax errors
- Extract exact location (file + line number)

## 3. Auto-Fix Common Issues
- **Supabase query errors:**
  - Replace `.catch()` with `try/catch`
  - Add `as any` to Supabase inserts
  - Fix chained operations
- **TypeScript errors:**
  - Add missing type casts
  - Fix const/let reassignment issues
  - Import corrections
- **Unused variables:**
  - Remove unused imports
  - Clean up dead code

## 4. Multi-Remote Push (CRITICAL)
**⚠️ Vercel is connected to tdavidyan85/amit-maymon-new (tomer), NOT sasha463111 (origin)**

After each commit, push to BOTH remotes:
```bash
git push origin main     # Backup to main repo (sasha463111)
git push tomer main      # Primary for Vercel (tdavidyan85) ← VERCEL WATCHES THIS
```

Then verify Vercel picks up commit:
- Check Vercel Deployments dashboard
- If webhook fires → deployment auto-starts ✅
- If not → trigger manual deployment with commit hash

## 5. Re-Push if Fixed
- Commit the fix: `fix: Auto-fixed [error type]`
- Push to BOTH remotes (origin + tomer)
- Verify build succeeds after re-push
- Report final status

## 6. Report to User
**Success:** 
```
✅ Deployment Verified
Commit: [hash]
Build: SUCCESS
Pushed to: origin (sasha463111) + tomer (tdavidyan85/Vercel)
Vercel Status: [Deployment auto-triggered / Manual trigger needed]
All systems go! 🚀
```

**Failure (couldn't auto-fix):**
```
🔴 Build Failed - Manual Review Needed
Error: [exact error message]
File: [path:line]
Reason: [why auto-fix didn't work]
Pushed to: origin + tomer (so commits are safe)
Next steps: User manually fixes and re-pushes
```

**Critical Issue (GitHub/Vercel mismatch):**
```
⚠️ WARNING: Commits pushed to both remotes, but Vercel not picking up
Commit: [hash] is on tomer/main (tdavidyan85)
Vercel Status: Not detecting commit
Recommendation: Manual deployment trigger or GitHub integration check
```

## Entry Point
Run after any production push:
```bash
npx ts-node --require dotenv/config scripts/validate-deploy.ts
```

Or invoke manually to verify latest commit:
```bash
npm run validate-deployment
```

## Tools Available
- Node.js + npm
- TypeScript compiler
- Git commands
- File system access
- Regex pattern matching for error detection

## Constraints
- Read-only to production (Vercel)
- Can only fix known patterns
- Max 3 auto-fix attempts per session
- Must verify each fix locally before pushing

## Success Criteria
- Build completes without errors
- No type errors or warnings
- Git push succeeds
- User receives status report
