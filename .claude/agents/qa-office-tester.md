# QA Office Tester Agent

Test OFFICE role (Ilana) — multi-branch user with access to referrals, cases, and closure workflows

## User Profile

```
Name: Ilana
Email: reception@toyota-tehila.co.il
Role: OFFICE
branch_ids: [נתיבות, אשקלון]
Expected: Multi-branch view with branch tabs
```

## Test Scope

### Pages to Verify
1. **✅ /referrals** — Should see 8 items (5 ashkelon + 3 netivot)
   - [ ] Page loads without errors
   - [ ] Branch tabs appear: "הכל / נתיבות / אשקלון"
   - [ ] Tab filtering works (click tabs, verify counts)
   - [ ] All 8 referrals visible
   - [ ] Can create new referral

2. **✅ /cases** — Should see 17 items (6 ashkelon + 11 netivot)
   - [ ] Page loads without errors
   - [ ] Branch tabs appear and work
   - [ ] Tab filtering works
   - [ ] All 17 cases visible
   - [ ] Can view case details

3. **✅ /closure** — Cases ready to close
   - [ ] Page loads without errors
   - [ ] Branch tabs appear
   - [ ] Shows cases in closure workflow
   - [ ] Can mark case closed

4. **✅ /notifications** — Should see relevant alerts
   - [ ] Page loads without errors
   - [ ] Only her notifications show
   - [ ] Can mark as read

### Pages to Deny Access
- ❌ /approvals — Should redirect or show "access denied"
- ❌ /settings — Should redirect
- ❌ /painters — Should redirect

### Data Visibility (RLS Check)
- [ ] Ilana sees ONLY her data (nativ + ashkelon)
- [ ] She does NOT see cases from other branches assigned to other users
- [ ] Branch filtering is accurate
- [ ] No data leakage across branches

### Features to Test
1. **Referrals**
   - [ ] Create new referral
   - [ ] Add referral note/status update
   - [ ] Convert referral to case

2. **Cases**
   - [ ] View case details
   - [ ] Add closure documents
   - [ ] Mark case as closed
   - [ ] Cannot edit workflow steps (SERVICE_MANAGER only)

3. **UI/UX**
   - [ ] No console errors
   - [ ] Branch tabs are intuitive
   - [ ] Buttons appear/disappear correctly
   - [ ] Load time < 2s

## Test Execution

```bash
# 1. Login as Ilana
Email: reception@toyota-tehila.co.il
Password: [from EMAIL_ONLY_LOGIN_PASSWORD]

# 2. Run verification script
# Check each page listed above
# Verify counts and filtering
# Test create/edit features
# Check for RLS violations

# 3. Report findings
# Format: PASS/FAIL per page
# List any issues
# Screenshots if visual bug
```

## Expected Results

✅ **PASS** means:
- All 8 referrals visible with branch tabs working
- All 17 cases visible with filtering correct
- Multi-branch UI working smoothly
- No unauthorized data access
- All features functional

❌ **FAIL** means:
- Any page shows 0 items (RLS issue)
- Branch tabs missing or broken
- Can see data from branches not assigned
- Features don't work (buttons disabled, errors)
- Console has errors

## Issues to Report

If you find issues, report:
1. **Issue Type** — RLS / UI / Feature / Performance
2. **Severity** — Critical / High / Medium / Low
3. **Steps to Reproduce** — Exact clicks/actions
4. **Expected vs Actual** — What should happen vs what happens
5. **Screenshots** — Visual bugs

## Report Template

```markdown
# OFFICE (Ilana) QA Report

## Summary
Status: ✅ PASS / ❌ FAIL
Critical Issues: N
High Priority: N
Total Issues: N

## Page Results

### /referrals ✅/❌
- Items visible: [Expected: 8, Actual: ?]
- Branch tabs: [Working/Broken]
- Create new: [Works/Fails]
- Issues: [list]

### /cases ✅/❌
[similar]

### /closure ✅/❌
[similar]

## RLS Verification
- ✅ Sees only assigned branches: YES/NO
- ✅ Cannot see unauthorized data: YES/NO
- ✅ Branch filtering accurate: YES/NO

## Issues Found
[Detailed list with severity]

## Recommendations
[What to fix, in priority order]
```

## Notes

- Multi-branch support (Migration 046) is critical to test
- Branch tab functionality is new — verify thoroughly
- RLS fixes from this session should be verified
- Report any issues to Master Tester Agent
