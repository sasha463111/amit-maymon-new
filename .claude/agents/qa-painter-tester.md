# QA Painter Tester Agent

Test PAINTER role (Arez) — limited access, work request management only

## User Profile

```
Role: PAINTER
Branch: נתיבות (Netivot only)
Expected: Minimal access, only own work area
Pages: /painters/[id], /extras/new, /extras/mine
```

## Test Scope

### Pages to Access (Limited)
1. **✅ /painters/[id]** — Own painter case details
   - [ ] Page loads with his specific case
   - [ ] Shows case workflow status
   - [ ] Can view painter requests
   - [ ] Can respond to requests

2. **✅ /extras/new** — Create work requests
   - [ ] Page loads without errors
   - [ ] Can create new work request
   - [ ] Can upload images
   - [ ] Request saved successfully

3. **✅ /extras/mine** — View own work items
   - [ ] Page loads, shows his extras
   - [ ] Can view status updates
   - [ ] Can see image gallery
   - [ ] Cannot edit (read-only or minimal edit)

### Pages to Deny Access
- ❌ /cases — Should redirect (read-only for advisors)
- ❌ /referrals — Should redirect
- ❌ /closure — Should redirect
- ❌ /approvals — Should redirect
- ❌ /settings — Should redirect
- ❌ /painters — List view should redirect (only own case)

### Data Visibility (RLS Check)
- [ ] Sees only his assigned cases in his branch
- [ ] Cannot see cases from other painters
- [ ] Cannot see ashkelon branch data
- [ ] Cannot see other painter requests

### Features to Test
1. **Work Requests**
   - [ ] Create new painter request (work type)
   - [ ] Create parts request
   - [ ] Upload images with request
   - [ ] View request status
   - [ ] Receive notifications when approved/rejected

2. **Extras Management**
   - [ ] Create body work extra
   - [ ] Upload images
   - [ ] View extra status
   - [ ] Cannot delete/modify others' extras

3. **UI/UX**
   - [ ] Minimal, focused interface
   - [ ] No admin features visible
   - [ ] Cannot create buttons for restricted actions
   - [ ] No console errors

## Test Execution

```bash
# 1. Login as PAINTER (Arez)
# 2. Verify only own pages accessible
# 3. Cannot access /cases, /referrals, etc.
# 4. Can create work requests
# 5. Can upload images
# 6. Can view own extras
# 7. Verify RLS enforcement
```

## Expected Results

✅ **PASS**:
- Limited to own case details
- Can create work requests
- Can upload images
- Cannot see other painters' work
- Cannot access admin pages
- RLS properly enforces restrictions

❌ **FAIL**:
- Can access restricted pages
- Can see other painters' work
- Cannot create requests
- Console errors
- Missing upload functionality

## Report Template

```markdown
# PAINTER (Arez) QA Report

## Summary
Status: ✅ PASS / ❌ FAIL
Access Level: Limited/Correct

## Page Results

### /painters/[id] ✅/❌
- Can view own case: YES/NO
- Can view requests: YES/NO
- Issues: [list]

### /extras/new ✅/❌
- Can create request: YES/NO
- Can upload images: YES/NO
- Issues: [list]

### /extras/mine ✅/❌
- Can view own: YES/NO
- Can see status: YES/NO
- Issues: [list]

## Access Control
- Cannot access /cases: YES/NO
- Cannot access /referrals: YES/NO
- Cannot access /settings: YES/NO

## RLS Verification
- Sees only own work: YES/NO
- Cannot see other painters: YES/NO

## Critical Findings
[Any unauthorized access or missing features]
```

## Success Criteria

- ✅ Can access own case details
- ✅ Can create work requests
- ✅ Can upload images
- ✅ Cannot access restricted pages
- ✅ Cannot see other painters' work
- ✅ RLS properly enforces restrictions
- ✅ Limited, focused UI
