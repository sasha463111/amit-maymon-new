// PREVIEW (Tomer, 2026-10-12): for now ONLY the CEO (Amit) sees the module —
// menu, page, case box, and no notifications to anyone else. Set to false to
// open it to everyone in the spec (painters, advisors, warehouse).
export const PART_RETURNS_CEO_ONLY = true;

export function canUsePartReturns(role: string | null | undefined): boolean {
  return !PART_RETURNS_CEO_ONLY || role === 'CEO';
}

// Lists for the parts-returns module (Amit, 2026-10-12). "אחר" opens free
// text — occasional suppliers, used parts.
export const PART_RETURN_SUPPLIERS = ['פינס', 'גנרל פארטס', 'טויוטה', 'UMI', 'מוטו פארטס', 'אחר'] as const;
export const PART_RETURN_REASONS = ['חלק לא מתאים', 'הוזמן בטעות', 'חלק פגום', 'כמות עודפת', 'תיקון בוטל', 'אחר'] as const;

export const PART_RETURN_STATUS_LABEL: Record<string, string> = {
  WAITING_PICKUP: 'ממתין לאיסוף',
  COLLECTED: 'נאסף · ממתין לזיכוי',
  CREDITED: 'זוכה',
  DISPUTE: 'בבירור',
  CANCELLED: 'בוטל',
};

/** Alerts: not collected after 7 days → warehouse manager; 14 → CEO. */
export const PART_RETURN_ALERT_DAYS = { manager: 7, ceo: 14 } as const;
