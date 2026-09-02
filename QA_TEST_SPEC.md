# QA Test Specification — Role-Based Testing

**Purpose:** Define comprehensive test coverage per role/user type  
**Last Updated:** 2026-09-01  
**Status:** 🔄 IN PROGRESS

---

## 📋 Test Structure

Each role has:
- **Pages to Access** — Which pages should be visible
- **Data to See** — Branch filtering, multi-branch views
- **Features to Test** — Create/Edit/Delete actions
- **Permissions** — What they can and cannot do
- **RLS Verification** — Data isolation by branch
- **UI Elements** — Role-specific buttons/tabs/menus

---

## 👥 Role: OFFICE (Ilana — Multi-branch)

**Profile:**
```
ID: d7058894-3cc5-4143-baa7-8bd3da1b369b
Email: reception@toyota-tehila.co.il
Role: OFFICE
branch_ids: ['cd63a188-e2d1-4b44-96f3-a2030bf4ef16', '18332d4f-d18a-4269-9edc-cdbf9b96c8f3']
  → נתיבות (cd63a188...) + אשקלון (18332d4f...)
```

### Pages to Access
- ✅ `/referrals` — Create, View, Update referrals
- ✅ `/cases` — View cases (read/filtered by branch)
- ✅ `/closure` — Manage case closure workflow
- ✅ `/notifications` — View notifications
- ❌ `/approvals` — Should NOT access (CEO only)
- ❌ `/painters` — Should NOT access (SERVICE_MANAGER/PAINTER)
- ❌ `/settings` — Should NOT access (CEO only)

### Data Visibility (RLS)
- ✅ See 8 referrals (5 ashkelon + 3 netivot)
- ✅ See 17 cases (6 ashkelon + 11 netivot)
- ✅ See cases ready for closure (0 currently)
- ✅ Branch tabs: "הכל / נתיבות / אשקלון"
- ✅ Switch between branches and see filtered data

### Features to Test
- ✅ Create new referral
- ✅ Create case from referral
- ✅ Add closure documents
- ✅ Mark case closed
- ✅ View referral status updates
- ✅ Add referral notes

### Permissions (What NOT to do)
- ❌ Cannot approve estimates (CEO only)
- ❌ Cannot assign painters (SERVICE_MANAGER only)
- ❌ Cannot manage users (CEO only)
- ❌ Cannot see service manager workflow details

### UI/UX Checks
- ✅ Navigation bar shows: cases, closure, referrals, notifications
- ✅ Branch tabs appear and work correctly
- ✅ Create buttons are visible and functional
- ❌ Approvals/Settings buttons should be hidden

---

## 👨‍🔧 Role: SERVICE_MANAGER (Aran)

**Profile:**
```
ID: (lookup in DB)
Role: SERVICE_MANAGER
branch_id: cd63a188-e2d1-4b44-96f3-a2030bf4ef16 (Netivot only)
```

### Pages to Access
- ✅ `/cases` — Full workflow management
- ✅ `/painters` — Painter management + requests
- ✅ `/notifications` — View notifications
- ✅ `/cases/[id]` — Detailed case management
- ❌ `/referrals` — Should NOT access
- ❌ `/approvals` — Should NOT access
- ❌ `/closure` — Should NOT access
- ❌ `/settings` — Should NOT access

### Data Visibility (RLS)
- ✅ See only NETIVOT cases (11 cases)
- ❌ Should NOT see ASHKELON cases (6 cases)
- ✅ See painter requests for his branch
- ✅ See notifications related to his cases

### Features to Test
- ✅ Complete workflow steps (FixCar, Estimate, etc.)
- ✅ Create painter requests
- ✅ Respond to painter requests
- ✅ Assign quality control advisor
- ✅ Mark case for closure
- ❌ Cannot mark case as closed (OFFICE only)

### Permissions
- ❌ Cannot access other branch data (RLS)
- ❌ Cannot create referrals
- ❌ Cannot approve estimates (CEO only)
- ❌ Cannot manage workflow step templates

### UI/UX Checks
- ✅ No branch tabs (single branch)
- ✅ Painter section visible
- ✅ Workflow step buttons appear
- ✅ No referrals tab

---

## 👨‍💼 Role: CEO (Amit)

**Profile:**
```
ID: (lookup in DB)
Role: CEO
branch_ids: [] (empty = all branches)
```

### Pages to Access
- ✅ `/cases` — All cases (both branches)
- ✅ `/referrals` — All referrals
- ✅ `/closure` — All cases in closure
- ✅ `/approvals` — All pending approvals
- ✅ `/painters` — All painters
- ✅ `/settings` — All settings
- ✅ `/notifications` — All notifications

### Data Visibility (RLS)
- ✅ See 17 cases (6 ashkelon + 11 netivot)
- ✅ See 8 referrals (5 ashkelon + 3 netivot)
- ✅ See ALL users in settings
- ✅ Branch tabs work and show all data
- ✅ Can filter by branch or see "הכל"

### Features to Test
- ✅ Approve/reject estimates
- ✅ Delete cases (soft delete)
- ✅ Manage users (assign branches)
- ✅ Configure workflow steps
- ✅ View analytics/reports
- ✅ Send daily summary report
- ✅ Manage painters

### Permissions
- ✅ Highest access level (can see/do everything)
- ✅ Bypass all RLS restrictions
- ✅ Approve estimates
- ✅ Delete cases
- ✅ Manage system settings

### UI/UX Checks
- ✅ All navigation items visible
- ✅ Settings tab appears
- ✅ Branch tabs show all data
- ✅ Approvals section visible
- ✅ Admin functions accessible

---

## 🎨 Role: PAINTER (Arez)

**Profile:**
```
ID: (lookup in DB)
Role: PAINTER
branch_id: cd63a188-e2d1-4b44-96f3-a2030bf4ef16 (Netivot)
```

### Pages to Access
- ✅ `/painters/[id]` — Own case details + requests
- ✅ `/extras/new` — Create work requests
- ✅ `/extras/mine` — View own work items
- ❌ `/cases` — Should NOT access
- ❌ `/referrals` — Should NOT access
- ❌ `/settings` — Should NOT access

### Data Visibility (RLS)
- ✅ See only cases assigned to him in his branch
- ❌ Should NOT see cases from other branches
- ✅ See own extras/requests

### Features to Test
- ✅ Create painter request (work/parts)
- ✅ Upload images for requests
- ✅ View request status updates
- ✅ Mark work as complete
- ✅ Create body work extras

### Permissions
- ❌ Cannot approve anything
- ❌ Cannot manage users
- ❌ Cannot see referrals/closure workflow

### UI/UX Checks
- ✅ Minimal navigation (only relevant pages)
- ✅ No admin/CEO features
- ✅ Own painter board visible

---

## 📋 Role: SERVICE_ADVISOR (Knarit)

**Profile:**
```
ID: (lookup in DB)
Role: SERVICE_ADVISOR
sees_all_branches: false (single branch) OR true (cross-branch)
```

### Pages to Access
- ✅ `/cases` — Read-only view
- ✅ `/notifications` — View notifications
- ❌ `/approvals` — Should NOT access
- ❌ `/referrals` — Should NOT access
- ❌ `/painters` — Should NOT access (unless bodywork_advisor)

### Data Visibility (RLS)
- ✅ See cases (read-only, no edit buttons)
- ✅ Filter by branch if sees_all_branches=true
- ✅ See relevant notifications

### Features to Test
- ❌ Cannot create/edit cases
- ❌ Cannot complete workflow steps
- ✅ CAN view case details (read-only)
- ✅ If is_bodywork_advisor: see QC section + receive QC notifications

### Permissions
- ❌ Strictly read-only
- ✅ If bodywork_advisor: receive notifications, appear in QC dropdown

### UI/UX Checks
- ✅ No edit/create buttons
- ✅ View-only layout
- ✅ Notifications appear if relevant

---

## 🧪 Testing Checklist Template

For each role, test:

### ✅ Access Control
- [ ] Can access all required pages
- [ ] Cannot access restricted pages
- [ ] Redirects to login if not authenticated

### ✅ Data Visibility (RLS)
- [ ] Sees correct number of records
- [ ] Branch filtering works
- [ ] Cannot see data from other branches
- [ ] Multi-branch view shows all assigned branches

### ✅ Features
- [ ] Create operations work
- [ ] Edit operations work (if allowed)
- [ ] Delete operations work (if allowed)
- [ ] Buttons appear/disappear based on permissions

### ✅ UI/UX
- [ ] Navigation shows relevant items
- [ ] Branch tabs appear when needed
- [ ] Disabled buttons show tooltips
- [ ] No console errors

### ✅ Performance
- [ ] Pages load in <2s
- [ ] No N+1 queries
- [ ] Smooth branch switching

### ✅ Security
- [ ] RLS policies enforce data isolation
- [ ] Cannot directly access URLs they shouldn't
- [ ] Session timeouts work

---

## 📊 Test Results (To be filled by agents)

| Role | Page | Status | Issues | Notes |
|------|------|--------|--------|-------|
| OFFICE | /referrals | ⏳ Testing | — | — |
| OFFICE | /cases | ⏳ Testing | — | — |
| SERVICE_MANAGER | /cases | ⏳ Pending | — | — |
| CEO | /settings | ⏳ Pending | — | — |
| PAINTER | /painters/[id] | ⏳ Pending | — | — |

---

## 🎯 Priority Order

1. **OFFICE (Ilana)** — Multi-branch fix critical
2. **SERVICE_MANAGER (Aran)** — Core workflow
3. **CEO (Amit)** — Full access verification
4. **PAINTER (Arez)** — Limited access
5. **SERVICE_ADVISOR (Knarit)** — Read-only verification

---

**Next:** Deploy agents to test each role systematically
