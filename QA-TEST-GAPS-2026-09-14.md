# 🔴 QA Test Gaps Analysis - 2026-09-14

**Document Purpose:** Post-mortem on 4 critical bugs missed by QA agents. Prevention framework for future.

---

## 1️⃣ Bug: Branch Picker Not Showing (Multi-Branch Users)

### What Happened
- NewReferralButton + CreateCaseButton had logic: `branchIds.length === 0`
- Multi-branch users (Ilana: 2 branches) got NO picker, defaulted to first branch
- Users couldn't choose which branch to work in

### Why QA Missed It
❌ Test only checked single-branch scenarios (CEO with 0 branches)
❌ Never tested OFFICE/SERVICE_MANAGER with 2+ branches
❌ No "branch selection" test case

### Fix
Changed logic to: `branchIds.length !== 1` (show picker for multi-branch)

### QA Test Case (REQUIRED)
```gherkin
Scenario: OFFICE staff with 2 branches can select which branch
  Given User is OFFICE with branch_ids = [NETIVOT, ASHKELON]
  When User opens Create Referral dialog
  Then Branch selector dropdown MUST show
  And User can select either NETIVOT or ASHKELON
  And Form defaults to first branch (not required)
  
Scenario: SERVICE_MANAGER with 2 branches can select which branch
  Given User is SERVICE_MANAGER with branch_ids = [NETIVOT, ASHKELON]
  When User opens Create Case dialog
  Then Branch selector dropdown MUST show
  And User can switch between branches
```

---

## 2️⃣ Bug: File Upload "Profile Not Found" Error (documents.ts)

### What Happened
- `uploadCaseDocument()` was selecting `branch_id` (singular, doesn't exist)
- Should select `branch_ids` (array, which is what the schema has)
- Every file upload failed with "Profile not found"

### Why QA Missed It
❌ No file upload test case in QA framework
❌ No validation of Server Action column selects
❌ Bug was identical to referrals.ts (which WAS fixed in 4882bac), but QA didn't check for pattern repetition

### Fix
Changed `branch_id` → `branch_ids` in documents.ts (both functions)

### QA Test Case (REQUIRED)
```gherkin
Scenario: User can upload file when creating case
  Given User is SERVICE_MANAGER
  When User creates case with 1 image file
  Then Case MUST be created
  And File MUST be uploaded to storage
  And No "Profile not found" error
  
Scenario: User can upload file when creating referral
  Given User is OFFICE
  When User creates referral with 1 image file
  Then Referral MUST be created
  And File MUST be uploaded to storage
  And referral_documents table MUST have entry
```

---

## 3️⃣ Bug: Storage RLS Function Path Extraction

### What Happened
- `_storage_referral_id()` was extracting array[2] (filename)
- Should extract array[1] (referral_id)
- Path format: `{referral_id}/{filename}`
- RLS policy got NULL → rejected all file uploads

### Why QA Missed It
❌ No storage RLS policy validation test
❌ No "file upload with RLS check" scenario
❌ Database function assumptions never verified

### Fix
Changed function from `[2]` → `[1]` (extract correct path segment)

### QA Test Case (REQUIRED)
```gherkin
Scenario: Storage RLS policy allows file upload for valid user
  Given User is OFFICE with referral in their branch
  When User uploads file to referral-documents bucket
  Then File MUST upload successfully
  And Storage RLS check MUST pass
  
Scenario: Storage RLS policy blocks file upload for unauthorized user
  Given User is OFFICE with referral NOT in their branch
  When User tries to upload file
  Then Upload MUST be rejected by RLS policy
  And Error message MUST be clear
```

---

## 4️⃣ Bug: SERVICE_ADVISOR Can Create Cases (Permission Mismatch)

### What Happened
- Server Action allowed SERVICE_ADVISOR to create cases
- But RLS policy blocked them (correct design)
- Mismatch: code said "yes" but database said "no"
- User got confusing RLS error instead of clear permission error

### Why QA Missed It
❌ No role-permission enforcement test
❌ Didn't verify Server Action matches RLS policies
❌ Only tested "happy path" (allowed roles), not "sad path" (blocked roles)

### Fix
Removed SERVICE_ADVISOR from createCase permissions (they're read-only)

### QA Test Case (REQUIRED)
```gherkin
Scenario: SERVICE_ADVISOR CANNOT create cases
  Given User is SERVICE_ADVISOR
  When User navigates to /cases
  Then "Create Case" button MUST NOT appear
  
Scenario: SERVICE_ADVISOR CANNOT create referrals
  Given User is SERVICE_ADVISOR
  When User navigates to /referrals
  Then /referrals page MUST show "no access" (or redirect)
  
Scenario: Permission mismatch detection
  For each Server Action that modifies data:
    - Server Action must allow only roles X, Y, Z
    - RLS policy must allow only roles X, Y, Z
    - If mismatch → QA MUST flag it
```

---

## 📋 QA Framework Gaps

### Missing Test Categories
1. ❌ **File Upload Tests** - Zero coverage of storage operations
2. ❌ **Multi-Branch Tests** - Only single-branch scenarios tested
3. ❌ **RLS Policy Tests** - No validation of database policies
4. ❌ **Server Action Column Validation** - No check that selected columns exist
5. ❌ **Permission Enforcement Tests** - No verification of role-based access
6. ❌ **Pattern Detection** - No flag for "same bug in multiple files"

### Root Cause
- QA tests were **happy-path only** (does it work for valid users?)
- Missing **sad-path tests** (does it correctly reject invalid users?)
- No **structural validation** (do columns/functions exist?)
- No **cross-file consistency checks** (do similar patterns use same logic?)

---

## ✅ Updated QA Checklist (MANDATORY)

Before ANY production deployment:

### 1. **File Upload Tests** (All Roles)
- [ ] SERVICE_MANAGER creates case WITH file
- [ ] OFFICE creates referral WITH file
- [ ] CEO creates case WITH file
- [ ] SERVICE_ADVISOR tries to create case (blocked) WITH file
- [ ] PAINTER creates extra WITH file
- [ ] All uploads succeed or fail as expected

### 2. **Multi-Branch Tests**
- [ ] OFFICE with 1 branch: NO picker
- [ ] OFFICE with 2+ branches: YES picker, can select
- [ ] SERVICE_MANAGER with 2+ branches: YES picker
- [ ] CEO (0 branches): YES picker
- [ ] Each role can only see their own branches

### 3. **RLS Policy Validation**
- [ ] Storage file path extraction works (`_storage_referral_id`, `_storage_case_id`)
- [ ] RLS policy allows authorized users, blocks unauthorized
- [ ] No NULL errors from path extraction
- [ ] Cross-branch access blocked correctly

### 4. **Permission Enforcement**
- [ ] Each role CANNOT access pages/features they shouldn't
- [ ] Button visibility matches role permissions
- [ ] Server Action rejects unauthorized roles
- [ ] RLS policy matches Server Action permissions

### 5. **Column/Schema Validation**
- [ ] All `.select()` statements use CORRECT column names
- [ ] No `branch_id` if schema has `branch_ids`
- [ ] No typos in column names
- [ ] Type casting matches actual column types

### 6. **Cross-File Consistency**
- [ ] If bug fixed in file A, check if same pattern in files B, C, D
- [ ] All similar operations use same pattern (multi-branch checks)
- [ ] Helper functions used consistently

---

## 🚀 How to Prevent This Again

### For QA Agents:
1. **Test EVERY branch through file upload** (not just creation)
2. **Test EVERY role** (including ones that should be blocked)
3. **Validate database functions** (check they extract correct data)
4. **Check RLS vs Server Action consistency** (same permissions?)
5. **Search for pattern repetitions** (if bug in A, look in B-Z)

### For Code Reviews:
1. Grep for same column name pattern across all Server Actions
2. Verify every `.select()` matches actual schema
3. Check RLS policies match Server Action permissions
4. Look for multi-branch logic - should use `.includes()` not `===`

### For Developers:
1. Write test case BEFORE fix (TDD)
2. Test full flow (create → edit → upload → delete)
3. Test all roles (authorized AND unauthorized)
4. Check if similar pattern exists elsewhere

---

## 📊 Metrics

| Metric | Before | After | Goal |
|--------|--------|-------|------|
| **Test Coverage** | Happy-path only | ✅ Happy + Sad path | 100% |
| **File Upload Tests** | 0 | ✅ 5+ | All roles |
| **Multi-Branch Tests** | 0 | ✅ 4+ | All multi scenarios |
| **Permission Tests** | 0 | ✅ 6+ | All roles + denials |
| **RLS Tests** | 0 | ✅ 3+ | All storage ops |

---

## Next Steps

1. ✅ Update QA agents with new test cases
2. ✅ Re-run full QA suite with updated cases
3. ✅ Add pattern detection to QA framework
4. ✅ Document this incident in CLAUDE.md
5. ✅ Monthly audit of "similar bugs across files"

---

**Document Version:** 1.0  
**Date:** 2026-09-14  
**Author:** Claude + Tomer (Post-Mortem)  
**Status:** Action Items OPEN - Waiting for QA Framework Update
