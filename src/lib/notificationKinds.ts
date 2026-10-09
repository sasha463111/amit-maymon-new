// Which notification types need the reader to ACT (as opposed to plain
// updates). One list, used by the bell's "לטיפול" tab and by "mark updates
// read". It is the same set the cases list already flags as urgent (red +
// amber severity in cases/layout.tsx) plus personal notes/questions and
// "ready for closure". Added 2026-10-09 at Amit's request: the bell mixed
// both kinds, so he had to hunt for what was waiting for him.
export const ACTION_TYPES = [
  'PENDING_APPROVAL', // an approval waiting for a decision
  'CEO_REJECTED', // a step was rejected, someone has to fix it
  'BLOCKED_ACTION', // an attempted action was blocked
  'BLOCKER',
  'PAINTER_REQUEST', // a painter asked for something
  'APPROVAL_NEEDED',
  'APPROVAL_REQUIRED',
  'EXTRA_CREATED', // an extra was added and needs handling
  'DIRECT_NOTE', // a note/question sent to me personally
  'READY_FOR_OFFICE', // a case is ready for closure
] as const;

export const ACTION_TYPE_SET: ReadonlySet<string> = new Set(ACTION_TYPES);
