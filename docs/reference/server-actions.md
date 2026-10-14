# Server Actions — מפה מלאה

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

## 11. Server Actions — מפה מלאה

### `workflow.ts`
- `createCase(input)` — יוצר car + case + workflow run + steps
- `completeActiveStep(caseId, stepId)` — מסמן שלב DONE, מפעיל הבא
- `returnToEstimate(caseId)` — מחזיר ל-PREP_ESTIMATE
- `deleteCase(caseId)` — **soft delete** (CEO בלבד)
- `restoreCase(caseId)` — שחזור תיק מחוק (CEO בלבד)

### `approvals.ts`
- `getApprovals()` — שולף אישורים פנדינג
- `decideApproval(id, status, note)` — אישור/דחייה + revalidatePath

### `caseDetails.ts`
- `updateCaseDetails(caseId, caseUpdates, carUpdates?)` — עדכון inline של שדות

### `documents.ts`
- `uploadCaseDocument(formData)` — העלאה ל-storage + DB record
- `deleteCaseDocument(id)` — מחיקה
- `getSignedFileUrls(bucket, paths)` — signed URLs מרובים

### `extras.ts`
- `createExtra(input)` — יצירת תוספת פחח עם upload תמונה
- `updateExtraStatus(id, status)` — שינוי סטטוס (SERVICE_MANAGER/CEO)

### `painter.ts`
- `updatePainterChecklist(caseId, updates)` — נכנס לעבודה / התקבל חלקים
- `createPainterRequest(caseId, desc, type, images?)` — בקשת תוספת + התראה
- `getPainterRequests(caseId)`
- `updatePainterRequestStatus(id, status, note?)` — סטטוס כולל `REJECTED`

### `referrals.ts`
- `createReferral(input)` / `updateReferral(id, updates)` / `cancelReferral(id)` — CRUD בסיסי
- `convertReferral(referralId, caseId)` — נקרא אחרי יצירת תיק מההפניה
- `addReferralStatusUpdate(id, statusTag, note)` — מוסיף שורה ליומן המעקב
- `getReferralStatusUpdates(id)` — שולף את היומן
- `setReferralFollowUpDate(id, date)` — קובע/מנקה תאריך תזכורת
- `uploadReferralDocument(formData)` / `deleteReferralDocument(id)`

### `settings.ts`
- `getRolePermissions()` / `updateRolePermission(role, action, enabled)`
- `getWorkflowStepTemplates()` / `updateWorkflowStep()` / `addWorkflowStep()` / `removeWorkflowStep()`
- `getBodyworkAdvisors()` / `toggleBodyworkAdvisor(profileId, isAdvisor)`

### `notifications.ts`
- `getNotifications()` / `markAsRead(id)` / `markAllAsRead()`

### `push.ts`
- `savePushSubscription(sub)` / `removePushSubscription(endpoint)` — ניהול Push API subscription
- `sendPushToUser(userId, payload)` — שולח web push
- `pushToOverseers(payload, excludeUserId?)` — שולח לכל CEO + SERVICE_ADVISOR
- `sendTestPushToSelf()` — כלי אבחון

### `vehicleLookup.ts`
- `lookupVehicleByPlate(plate)` — שולף סוג/שנת רכב מ-data.gov.il

### `reports.ts`
- `sendSummaryReport()` — דוח סיכום יומי דרך Resend, CEO-only

