# QA Service Manager Tester Agent

Test SERVICE_MANAGER role (Aran) — single-branch user managing cases and painters

## User Profile

```
Role: SERVICE_MANAGER
Branch: נתיבות (Netivot only)
Expected: Single-branch view, NO tabs (only 1 branch)
Access: /cases, /painters, /notifications (full workflow)
```

## Test Scope

### Pages to Verify
1. **✅ /cases** — Should see 11 netivot cases (NOT 6 ashkelon)
   - [ ] Page loads, shows 11 cases
   - [ ] NO branch tabs (only 1 branch assigned)
   - [ ] Can complete workflow steps
   - [ ] Cannot see ashkelon cases

2. **✅ /painters** — Painter board for his branch
   - [ ] Page loads without errors
   - [ ] Shows painters assigned to netivot
   - [ ] Can click into painter case details
   - [ ] Cannot see ashkelon painters

3. **✅ /notifications** — His workflow notifications
   - [ ] Page loads without errors
   - [ ] Only relevant notifications show

### Pages to Deny Access
- ❌ /referrals — Should redirect
- ❌ /closure — Should redirect (OFFICE only)
- ❌ /approvals — Should redirect (CEO only)
- ❌ /settings — Should redirect (CEO only)

### Data Visibility (RLS Check)
- [ ] Sees ONLY netivot cases (11)
- [ ] Does NOT see ashkelon cases (6)
- [ ] Cannot access ashkelon painter requests
- [ ] RLS properly filters by branch

### Features to Test
1. **Workflow Management**
   - [ ] Complete FixCar photos step
   - [ ] Prepare estimate
   - [ ] Send to appraiser
   - [ ] Mark for quality control
   - [ ] Mark case ready for office

2. **Painter Requests**
   - [ ] View painter requests
   - [ ] Create new painter request
   - [ ] Respond to painter request (approve/reject)
   - [ ] Upload images

3. **UI/UX**
   - [ ] No branch tabs (verify single branch)
   - [ ] Workflow buttons appear correctly
   - [ ] No console errors
   - [ ] Load time < 2s

## Test Execution

```bash
# 1. Login as SERVICE_MANAGER (Aran)
# 2. Verify access to /cases
#    - Count: 11 cases (netivot only)
#    - NO tabs
#    - Can complete steps
# 3. Verify /painters works
# 4. Verify cannot access /referrals, /closure, /approvals
# 5. Verify RLS enforcement (no ashkelon data)
```

## Expected Results

✅ **PASS**:
- 11 netivot cases visible (NOT 17 total)
- NO branch tabs
- Full workflow access
- Zero ashkelon data visible
- Painter requests work

❌ **FAIL**:
- Shows 17 cases (RLS broken)
- Branch tabs appear (wrong)
- Cannot complete workflow steps
- Can see ashkelon cases (data leak)

## Report Template

```markdown
# SERVICE_MANAGER (Aran) QA Report

## Summary
Status: ✅ PASS / ❌ FAIL

## Page Results

### /cases ✅/❌
- Cases visible: [Expected: 11, Actual: ?]
- Branch tabs: [Expected: None, Actual: ?]
- Workflow steps: [Working/Broken]
- Issues: [list]

### /painters ✅/❌
[similar]

### /notifications ✅/❌
[similar]

## RLS Verification
- Sees only netivot: YES/NO
- Cannot see ashkelon: YES/NO

## Critical Findings
[Any data leakage or broken features]
```

## Success Criteria

- ✅ Exactly 11 cases visible
- ✅ No branch tabs (single branch)
- ✅ Cannot access forbidden pages
- ✅ Cannot see ashkelon data (RLS)
- ✅ Workflow features work
