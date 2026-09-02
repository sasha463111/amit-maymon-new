# QA CEO Tester Agent

Test CEO role (Amit) — full system access across all branches and features

## User Profile

```
Role: CEO
branch_ids: [] (empty = all branches)
Expected: Full access to everything, all branches visible
```

## Test Scope

### Pages to Access (All)
1. **✅ /cases** — All 17 cases (6 ashkelon + 11 netivot)
   - [ ] Page loads, shows 17 cases
   - [ ] Branch tabs appear: "הכל / נתיבות / אשקלון"
   - [ ] "הכל" shows 17, nativ shows 11, ashkelon shows 6
   - [ ] Tab filtering works correctly

2. **✅ /referrals** — All 8 referrals
   - [ ] Page loads, shows 8 referrals
   - [ ] Branch tabs work
   - [ ] Can create/edit referrals
   - [ ] Full filtering by branch

3. **✅ /closure** — Cases ready to close
   - [ ] Shows all cases in closure workflow
   - [ ] Branch tabs work
   - [ ] Can mark case closed

4. **✅ /approvals** — CEO-only page
   - [ ] Page loads without errors
   - [ ] Shows pending estimate approvals
   - [ ] Can approve/reject estimates
   - [ ] Rejection notes work

5. **✅ /painters** — All painters across branches
   - [ ] Page loads, shows all painters
   - [ ] Can click into painter cases
   - [ ] Can view painter requests

6. **✅ /settings** — Admin-only configuration
   - [ ] Users tab: can see all users
   - [ ] Can assign branches to OFFICE staff
   - [ ] Can toggle bodywork advisor status
   - [ ] Can manage workflow steps

7. **✅ /notifications** — All system notifications
   - [ ] Page loads without errors
   - [ ] Shows all notifications (even his own actions)

### Data Visibility (RLS Check)
- [ ] Sees ALL 17 cases
- [ ] Sees ALL 8 referrals
- [ ] Can access both branches
- [ ] Branch filtering shows correct counts
- [ ] Can bypass RLS when needed (CEO privilege)

### Features to Test
1. **Approvals**
   - [ ] View pending estimates
   - [ ] Approve estimate
   - [ ] Reject estimate with note
   - [ ] Re-approve after rejection

2. **User Management**
   - [ ] View all users
   - [ ] Assign branches to OFFICE staff
   - [ ] Enable/disable users
   - [ ] Promote user to bodywork advisor

3. **Case Management**
   - [ ] Delete case (soft delete)
   - [ ] Restore deleted case
   - [ ] View all case details
   - [ ] Mark case complete

4. **System Admin**
   - [ ] Configure workflow steps
   - [ ] Modify role permissions
   - [ ] Send test push notification
   - [ ] Send daily summary report

5. **UI/UX**
   - [ ] All navigation items visible
   - [ ] Admin-only buttons show
   - [ ] Settings tab accessible
   - [ ] No console errors

## Test Execution

```bash
# 1. Login as CEO (Amit)
# 2. Verify access to ALL pages
# 3. Check /cases shows 17 items
#    - Branch tabs show: 17 / 11 / 6
# 4. Check /approvals works
# 5. Check /settings accessible
# 6. Verify can approve/reject estimates
# 7. Verify multi-branch data visible
```

## Expected Results

✅ **PASS**:
- All 17 cases visible
- All 8 referrals visible
- Branch tabs work correctly
- Tab counts: 17 / 11 / 6
- Approvals functional
- Settings accessible
- Can approve estimates
- Full data access

❌ **FAIL**:
- Missing cases/referrals (data issue)
- Branch tabs broken
- Cannot access approvals
- Cannot access settings
- Cannot approve estimates
- Missing admin features

## Report Template

```markdown
# CEO (Amit) QA Report

## Summary
Status: ✅ PASS / ❌ FAIL
Total Cases: [Expected: 17, Actual: ?]
Total Referrals: [Expected: 8, Actual: ?]

## Page Results

### /cases ✅/❌
- All cases visible: [17/17]
- Branch tab "הכל": [17]
- Branch tab "נתיבות": [11]
- Branch tab "אשקלון": [6]
- Tab filtering: [Working/Broken]

### /approvals ✅/❌
- Can access: YES/NO
- Can approve: YES/NO
- Can reject: YES/NO
- Issues: [list]

### /settings ✅/❌
- Can access: YES/NO
- User management: [Working/Broken]
- Workflow config: [Working/Broken]

## Full System Access
- ✅ Sees all data: YES/NO
- ✅ Can perform admin actions: YES/NO
- ✅ No permission errors: YES/NO

## Critical Findings
[Any missing features or broken access]
```

## Success Criteria

- ✅ All 17 cases visible
- ✅ All 8 referrals visible
- ✅ Branch tabs show correct counts
- ✅ Approvals page works
- ✅ Settings accessible
- ✅ Can approve/reject estimates
- ✅ Can manage users
- ✅ Full admin access confirmed
