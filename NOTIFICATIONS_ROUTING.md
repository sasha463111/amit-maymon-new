# Notification System Refactor - Complete Documentation

## Overview
The notification system has been refactored to implement **smart role-based + branch-filtered routing**. Instead of sending notifications to all CEOs and SERVICE_ADVISORs for every action, the system now routes alerts only to relevant parties based on action type and branch context.

## Key Principles

### 1. Role-Based Filtering
- Only recipients relevant to an action type receive notifications
- Example: A painter request only goes to SERVICE_ADVISORs in that branch, not to OFFICE staff

### 2. Branch Filtering
- Notifications are filtered to the branch where the action occurred
- Cross-branch staff (those with `sees_all_branches` flag) are included
- Exception: CEO notifications span all branches (full audit trail)

### 3. Audit Trail
- **CEOs receive all notifications** for complete visibility and audit trail
- This is intentional: "שאוכל לעקוב" (I want to follow everything)
- CEOs are never excluded even if they triggered the action

### 4. Actor Exclusion
- The user who triggered the action is excluded from notifications
- **Exception**: CEOs always receive notifications, even their own actions

## Notification Routing Table

| Action Type | Recipients | Branch Filter | DB Notification Type | Location |
|---|---|---|---|---|
| **PENDING_APPROVAL** | CEO | All | `PENDING_APPROVAL` | workflow.ts:103 |
| **NEW_CASE** | SERVICE_MANAGER + CEO | Same branch | `OTHER` | workflow.ts:330 |
| **ENTER_WORK** | SERVICE_ADVISOR, PAINTER + CEO | Same branch | `OTHER` | workflow.ts:698 |
| **WASH_COMPLETE** | SERVICE_ADVISOR + CEO | Same branch | `WASH_STARTED` | workflow.ts:763 |
| **READY_FOR_OFFICE** | OFFICE + CEO | Same branch | `READY_FOR_OFFICE` | workflow.ts:591 |
| **CASE_CLOSED** | OFFICE, SERVICE_MANAGER + CEO | Same branch | `CASE_CLOSED` | workflow.ts:809 |
| **PAINTER_REQUEST** | SERVICE_ADVISOR, PAINTER + CEO | Same branch | `PAINTER_REQUEST` | painter.ts:189 |
| **PARTS_ARRIVED** | PAINTER + CEO | Same branch | `OTHER` | painter.ts:85 |
| **APPROVAL_REJECTED** | SERVICE_MANAGER + CEO | Same branch | `CEO_REJECTED` | approvals.ts:103 |
| **APPROVAL_APPROVED** | SERVICE_MANAGER + CEO | Same branch | `OTHER` | approvals.ts:124 |
| **EXTRA_CREATED** | SERVICE_MANAGER + CEO | Same branch | `EXTRA_CREATED` | extras.ts:68 |
| **COMPLETION_PHOTOS** | SERVICE_ADVISOR + CEO | Same branch | `OTHER` | workflow.ts (SEND_COMPLETION_PHOTOS) |

## Implementation Details

### New Function: `notifyRelevantParties()`

Located in `src/app/actions/push.ts`, this is the smart notification router.

**Signature:**
```typescript
export async function notifyRelevantParties(
  actionType: NotificationActionType,
  branchId: string | null | undefined,
  payload: { title: string; body?: string; url?: string; tag?: string },
  excludeUserId?: string,
  branchRecipients?: { id: string; role: string; is_bodywork_advisor?: boolean | null }[]
)
```

**Parameters:**
- `actionType`: The type of action that triggered notification (from `NotificationActionType` enum)
- `branchId`: The branch context for filtering (can be null for CEO-only notifications)
- `payload`: The push notification content (title, body, URL, tag)
- `excludeUserId`: The user who triggered the action (typically excluded)
- `branchRecipients`: Optional pre-fetched branch recipients to avoid extra queries

**Routing Configuration:**
```typescript
const NOTIFICATION_ROUTING: Record<NotificationActionType, NotificationRoutingConfig> = {
  PENDING_APPROVAL: { roles: ['CEO'], includeCeo: false },
  NEW_CASE: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  ENTER_WORK: { roles: ['SERVICE_ADVISOR', 'PAINTER'], includeCeo: true },
  WASH_COMPLETE: { roles: ['SERVICE_ADVISOR'], includeCeo: true },
  READY_FOR_OFFICE: { roles: ['OFFICE'], includeCeo: true },
  CASE_CLOSED: { roles: ['OFFICE', 'SERVICE_MANAGER'], includeCeo: true },
  PAINTER_REQUEST: { roles: ['SERVICE_ADVISOR', 'PAINTER'], includeCeo: true },
  PARTS_ARRIVED: { roles: ['PAINTER'], includeCeo: true },
  APPROVAL_REJECTED: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  APPROVAL_APPROVED: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  EXTRA_CREATED: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  COMPLETION_PHOTOS: { roles: ['SERVICE_ADVISOR'], includeCeo: true },
};
```

## Updated Action Files

### 1. `src/app/actions/workflow.ts`
- Line 103: `notifyCeosPendingApproval` - PENDING_APPROVAL routing
- Line 330: `createCase` - NEW_CASE routing
- Line 591: `completeActiveStep` (SEND_COMPLETION_PHOTOS) - READY_FOR_OFFICE routing
- Line 698: `completeActiveStep` (ENTER_WORK) - ENTER_WORK routing
- Line 763: `completeActiveStep` (WASH) - WASH_COMPLETE routing
- Line 809: `completeActiveStep` (CLOSE_CASE) - CASE_CLOSED routing

### 2. `src/app/actions/painter.ts`
- Line 85: `updatePainterChecklist` (parts_arrived) - PARTS_ARRIVED routing
- Line 189: `createPainterRequest` - PAINTER_REQUEST routing

### 3. `src/app/actions/approvals.ts`
- Line 103: `decideApproval` (REJECTED) - APPROVAL_REJECTED routing
- Line 124: `decideApproval` (APPROVED) - APPROVAL_APPROVED routing

### 4. `src/app/actions/extras.ts`
- Line 68: `createExtra` - EXTRA_CREATED routing

## Database Integration

### Fan-Out Trigger (Migration 031/032)
- Creates in-app notification copies for all recipients
- Works alongside the new routing system
- The routing system ONLY affects web push notifications

### Branch Recipients RPC
- Uses the `branch_recipients` SECURITY DEFINER function
- Bypasses RLS to include cross-branch staff
- See `src/lib/recipients.ts` for implementation

## Migration Guide

### Old Pattern
```typescript
// Before: sends to ALL CEOs + SERVICE_ADVISORs
await pushToOverseers({ title, body, url }, userId);
```

### New Pattern
```typescript
// After: sends only to SERVICE_MANAGER + CEO
await notifyRelevantParties('NEW_CASE', branchId, { title, body, url }, userId, branchStaff);
```

## Testing Checklist

When testing notifications, verify:

- [x] Correct recipients receive notifications based on action type
- [x] Branch filtering works (cross-branch staff in same branch receive it)
- [x] CEOs receive all notifications for audit trail
- [x] Actor exclusion works (except for CEOs)
- [x] Web push and in-app notifications stay in sync
- [x] No duplicate notifications due to concurrent inserts
- [x] Tags and URLs are correct for each notification type
- [x] Hebrew text renders correctly

## Future Extensibility

To add a new notification type:

1. Add new action type to `NotificationActionType` enum in `push.ts`
2. Add routing config to `NOTIFICATION_ROUTING` in `push.ts`
3. Replace `pushToOverseers()` calls with `notifyRelevantParties()` in action files
4. Document the new type in this file

## Performance Considerations

- **Branch Recipient Caching**: The `branchRecipients` parameter allows passing pre-fetched recipients to avoid extra DB queries
- **Sequential Notification Inserts**: In-app notification inserts are sequential (not concurrent) to avoid race conditions with the DB fan-out trigger's 10-second de-dup window
- **Parallel Web Push**: Web push notifications are sent in parallel using `Promise.all()` for speed

## Rollback Plan

If issues arise:

1. The old `pushToOverseers()` function still exists for fallback
2. All `notifyRelevantParties()` calls are clearly marked in code
3. Search "DEPRECATED" in `push.ts` to find and revert if needed

## Related Files

- `src/app/actions/push.ts` - Core routing logic
- `src/lib/recipients.ts` - Branch recipients helper
- `src/db/migrations/030_branch_recipients_fn.sql` - RPC definition
- `src/db/migrations/031_notifications_fanout_trigger.sql` - In-app trigger
- `AGENTS.md` - Original overseer documentation
- `CLAUDE.md` - Original overseer documentation

## Status

**Refactor Complete** ✅

All notification types have been analyzed, audited, and updated to use the new smart routing system.
