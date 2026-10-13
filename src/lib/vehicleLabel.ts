// Short car label next to a plate, e.g. "טויוטה C-HR HYBRID" (Amit,
// 2026-10-13: see what car it is without opening the case).
// cars.vehicle_type holds the Ministry of Transport wording — maker, country
// of manufacture, model: "טויוטה טורקיה C-HR HYBRID", "טויוטה ארהב\" HIGHLANDER HV",
// "מ.ג סין MG4". The country is the last Hebrew word before the Latin model,
// so it is dropped; a maker with no country after it is kept as is.
export function shortVehicle(vehicleType?: string | null, make?: string | null, model?: string | null): string {
  const vt = (vehicleType ?? '').trim();
  if (!vt) return [make, model].filter(Boolean).join(' ').trim();
  const words = vt.split(/\s+/);
  const firstLatin = words.findIndex((w) => /[A-Za-z0-9]/.test(w) && !/[֐-׿]/.test(w));
  if (firstLatin <= 0) return vt; // no Latin model, or it starts with one — leave it
  const hebrew = words.slice(0, firstLatin);
  const maker = hebrew.length > 1 ? hebrew.slice(0, -1) : hebrew;
  return [...maker, ...words.slice(firstLatin)].join(' ');
}
