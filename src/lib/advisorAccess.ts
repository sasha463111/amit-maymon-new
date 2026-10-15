// "🤖 התייעצות" (the in-app advisor) is for Amit ONLY — Tomer, 15/10: "לא
// לפתוח בשום פנים ואופן את התייעצות לאף אחד חוץ מעמית". Not by role (Tomer is
// also CEO) — by user id. Checked in the page and in every advisor action.
export const ADVISOR_USERS: readonly string[] = ['97fe50b8-5148-42a4-914c-0cd0d5c8ae6a']; // עמית מימון

export function canUseAdvisor(userId: string | null | undefined): boolean {
  return !!userId && ADVISOR_USERS.includes(userId);
}
