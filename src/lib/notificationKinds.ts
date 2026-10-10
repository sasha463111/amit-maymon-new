// Which notification types need the reader to ACT, as opposed to plain
// updates, depending on the reader's ROLE. Amit (2026-10-10): "לטיפולי" means
// what is for me - an estimate approval, a question sent to me - and
// everything else is a running feed he follows to see how the work goes and
// who did what. The first version used one list for everybody, so painter
// requests and blocked actions (not his) showed up as his.
//
// Follows the product's routing table (notifyRelevantParties in
// actions/push.ts): the CEO is the primary recipient only of approvals; every
// other CEO notification is an audit copy.
const ACTION_TYPES_BY_ROLE: Record<string, readonly string[]> = {
  CEO: ['PENDING_APPROVAL', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED', 'DIRECT_NOTE'],
  SERVICE_MANAGER: ['CEO_REJECTED', 'BLOCKED_ACTION', 'PAINTER_REQUEST', 'EXTRA_CREATED', 'DIRECT_NOTE'],
  SERVICE_ADVISOR: ['PAINTER_REQUEST', 'CEO_REJECTED', 'BLOCKED_ACTION', 'DIRECT_NOTE'],
  OFFICE: ['READY_FOR_OFFICE', 'BLOCKED_ACTION', 'DIRECT_NOTE'],
  PAINTER: ['PAINTER_REQUEST', 'DIRECT_NOTE'],
};

/** Types that need this role to act. Unknown role: only personal notes. */
export function actionTypesForRole(role: string | null | undefined): readonly string[] {
  return ACTION_TYPES_BY_ROLE[role ?? ''] ?? ['DIRECT_NOTE'];
}
