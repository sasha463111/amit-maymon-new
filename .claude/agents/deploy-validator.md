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

## 4. Re-Push if Fixed
- Commit the fix: `fix: Auto-fixed [error type]`
- Push to tomer main
- Verify build succeeds after re-push
- Report final status

## 5. Report to User
**Success:** 
```
✅ Deployment Verified
Commit: [hash]
Build: SUCCESS
All systems go! 🚀
```

**Failure (couldn't auto-fix):**
```
🔴 Build Failed - Manual Review Needed
Error: [exact error message]
File: [path:line]
Reason: [why auto-fix didn't work]
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
