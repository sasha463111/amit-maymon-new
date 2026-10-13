// One search rule for every case list (Amit, 2026-10-13: "שיהיה לכל מי שרוצה
// לחפש תיק"): the text matches any of the given fields; a plate typed with
// dashes or spaces ("122-42-402") still matches the stored digits.
export function matchesCaseQuery(query: string, fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[\s-]/g, '');
  const isPlate = /^\d{3,}$/.test(digits);
  return fields.some((f) => {
    if (!f) return false;
    const v = f.toLowerCase();
    return v.includes(q) || (isPlate && v.replace(/[\s-]/g, '').includes(digits));
  });
}
