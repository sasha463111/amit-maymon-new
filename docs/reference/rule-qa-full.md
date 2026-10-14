# Standing Rule #4 — QA מלא (הנוסח המקורי)

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

### 🔴 Standing Rule #4: Comprehensive QA Testing (2026-09-14)

**Policy:** QA agents MUST test both happy-path AND sad-path scenarios. Happy-path only is a critical failure.

**Root Cause:** On 2026-09-14, 4 critical bugs shipped to production because QA only tested "does it work for valid users?" Never asked "does it correctly reject invalid users?"

**Bugs QA Missed:**
1. ❌ Multi-branch selector not showing (only tested CEO scenario)
2. ❌ File uploads failing (no file upload tests at all)
3. ❌ Storage RLS path extraction wrong (no RLS validation tests)
4. ❌ SERVICE_ADVISOR creating cases (no permission enforcement tests)

**Mandatory QA Test Categories:**

| Category | What to Test | Why QA Missed It |
|----------|-------------|-----------------|
| **Happy Path** | Does it work for valid users? | Tested ✅ |
| **Sad Path** | Does it reject invalid users? | ❌ Never tested |
| **File Uploads** | Can users upload files in all flows? | ❌ Zero file upload tests |
| **Multi-Branch** | Do OFFICE/SERVICE_MANAGER with 2+ branches work? | ❌ Only tested CEO/0-branches |
| **RLS Policies** | Do database policies enforce correctly? | ❌ No RLS validation tests |
| **Permission Enforcement** | Does each role see/do only what they should? | ❌ Only tested allowed roles |
| **Cross-File Patterns** | If bug in file A, does it appear in B-Z? | ❌ No pattern detection |

**Mandatory Checklist Before Any Production Deployment:**

```
✅ 1. File Upload Tests
  - [ ] Each role that can upload: test full flow (create + upload + success)
  - [ ] Verify file stored in bucket
  - [ ] Verify document record created in database
  
✅ 2. Multi-Branch Tests  
  - [ ] OFFICE with 1 branch: NO picker (defaults)
  - [ ] OFFICE with 2+ branches: YES picker
  - [ ] SERVICE_MANAGER with 2+ branches: YES picker
  - [ ] Can switch branches and see/create correct branch's data
  
✅ 3. Permission Enforcement (Sad Path)
  - [ ] SERVICE_ADVISOR: CANNOT see/create cases
  - [ ] OFFICE: CANNOT create cases (referrals only)
  - [ ] PAINTER: CANNOT see cases page at all
  - [ ] Each role blocked correctly (not just missing button)
  
✅ 4. RLS Policy Validation
  - [ ] Storage file upload succeeds for authorized user
  - [ ] Storage file upload fails for unauthorized user
  - [ ] RLS policy errors are clear (not "Profile not found")
  
✅ 5. Column/Schema Consistency
  - [ ] All `.select()` statements use correct column names
  - [ ] If schema has `branch_ids`, code uses `branch_ids` (not `branch_id`)
  - [ ] No NULL errors from missing columns
  
✅ 6. Pattern Detection
  - [ ] If bug found in Server Action A, grep for same pattern in B-Z
  - [ ] If typo in column name, check all similar operations
  - [ ] If RLS policy issue, validate all similar policies
```

**Why This Rule Exists:**

Before (2026-09-13): QA agents were test-and-hope. They only checked "happy path" scenarios and missed critical sad-path failures.

After (2026-09-14): QA agents MUST validate that the system correctly handles BOTH valid AND invalid scenarios. A system that works for valid users but doesn't reject invalid ones is broken.

**Related files:**
- `QA-TEST-GAPS-2026-09-14.md` — Detailed post-mortem on all 4 missed bugs
- `.claude/agents/qa-master-tester.md` — Updated with new test cases
- `DEPLOYMENT_CHECKLIST.md` — Updated with QA checklist


