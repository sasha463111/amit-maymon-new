# QA Service Advisor Tester Agent

Test SERVICE_ADVISOR role (Knarit) — read-only access with optional bodywork advisor features

## User Profile

```
Role: SERVICE_ADVISOR
Branch: Single or multiple (depending on sees_all_branches flag)
Expected: Read-only access to cases
Special: If is_bodywork_advisor=true, can receive QC notifications
```

## Test Scope

### Pages to Access (Read-Only)
1. **✅ /cases** — Read-only case viewing
   - [ ] Page loads without errors
   - [ ] Can view case list (read-only)
   - [ ] Can click into case details
   - [ ] NO edit buttons visible
   - [ ] NO create case button
   - [ ] NO workflow step buttons

2. **✅ /notifications** — Relevant notifications
   - [ ] Page loads without errors
   - [ ] Can see notifications
   - [ ] If is_bodywork_advisor: sees QC requests
   - [ ] Can mark as read

### Pages to Deny Access
- ❌ /referrals — Should redirect
- ❌ /closure — Should redirect (OFFICE only)
- ❌ /approvals — Should redirect (CEO only)
- ❌ /painters — Should redirect
- ❌ /settings — Should redirect (CEO only)
- ❌ /extras — Should redirect

### Data Visibility (RLS Check)
- [ ] Sees cases (read-only)
- [ ] If sees_all_branches=false: only his branch
- [ ] If sees_all_branches=true: all branches
- [ ] Cannot see referrals or internal workflow
- [ ] Cannot see sensitive admin data

### Features to Test
1. **Case Viewing (Read-Only)**
   - [ ] Can view case list
   - [ ] Can click into case details
   - [ ] Can see workflow status
   - [ ] Cannot complete workflow steps
   - [ ] Cannot edit case details

2. **Quality Control (If is_bodywork_advisor=true)**
   - [ ] Can see QC section
   - [ ] Receives QC notifications
   - [ ] Appears in QC dropdown for assignment
   - [ ] Cannot actually approve/reject (view only)

3. **UI/UX**
   - [ ] No create/edit buttons
   - [ ] No workflow action buttons
   - [ ] View-only layout enforced
   - [ ] No console errors

## Test Execution

```bash
# 1. Login as SERVICE_ADVISOR (Knarit)
# 2. Verify /cases loads (read-only)
# 3. Verify NO edit buttons
# 4. Verify NO create case button
# 5. Verify cannot access /referrals, /settings
# 6. If is_bodywork_advisor: verify sees QC notifications
# 7. Verify RLS enforcement
```

## Expected Results

✅ **PASS**:
- Can view case list (read-only)
- No edit/create buttons visible
- Cannot access restricted pages
- RLS properly restricts access
- If advisor: QC notifications work

❌ **FAIL**:
- Edit buttons visible
- Can create/modify cases
- Can access restricted pages
- Cannot view cases
- Missing notifications (if advisor)

## Report Template

```markdown
# SERVICE_ADVISOR (Knarit) QA Report

## Summary
Status: ✅ PASS / ❌ FAIL
Access Level: Read-Only/Correct
Bodywork Advisor: YES/NO

## Page Results

### /cases ✅/❌
- Can view list: YES/NO
- Can view details: YES/NO
- No edit buttons: YES/NO
- No create button: YES/NO
- Issues: [list]

### /notifications ✅/❌
- Can view: YES/NO
- Receives QC alerts: [YES/NO/N-A]
- Issues: [list]

## Read-Only Enforcement
- Cannot edit cases: YES/NO
- Cannot create cases: YES/NO
- Cannot complete steps: YES/NO

## Access Control
- Cannot access /referrals: YES/NO
- Cannot access /settings: YES/NO
- Cannot access /closure: YES/NO

## Bodywork Advisor Features (if applicable)
- Sees QC section: [YES/NO]
- Receives QC notifications: [YES/NO]
- Correct permissions enforced: [YES/NO]

## Critical Findings
[Any unauthorized actions or missing features]
```

## Success Criteria

- ✅ Read-only access enforced
- ✅ No edit/create buttons
- ✅ Cannot access admin pages
- ✅ Can view case details
- ✅ RLS properly restricts data
- ✅ If advisor: QC features work
- ✅ Zero unauthorized actions possible
