/** Matrícula is stored digits-only. */
export function normalizeMembershipId(value: string): string {
  return value.replace(/\D/g, "");
}

/** Matrículas are 4–10 digits. */
export function isValidMembershipId(normalized: string): boolean {
  return /^\d{4,10}$/.test(normalized);
}

/** Display form with thousands dots: 104218 → 104.218. Accepts partial input while typing. */
export function formatMembershipId(value: string): string {
  return normalizeMembershipId(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Initials for avatars: "Rafael Almeida" → "RA". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
