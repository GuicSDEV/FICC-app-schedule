const DEPENDENT = /^\s*([\d.\s]+?)\s*-\s*(\d{1,2})\s*$/;

/**
 * Matrícula is stored digits-only; a dependent of a holder keeps a two-digit suffix after a
 * hyphen ("1234-01"), used when the club enables holder + dependents memberships.
 */
export function normalizeMembershipId(value: string): string {
  const dependent = DEPENDENT.exec(value);
  if (dependent) {
    return `${dependent[1]!.replace(/\D/g, "")}-${dependent[2]!.padStart(2, "0")}`;
  }
  return value.replace(/\D/g, "");
}

/** Matrículas are 4–10 digits; dependents add "-NN" (01–99) when `dependents` is allowed. */
export function isValidMembershipId(normalized: string, dependents = false): boolean {
  if (dependents && /^\d{4,10}-(0[1-9]|[1-9]\d)$/.test(normalized)) return true;
  return /^\d{4,10}$/.test(normalized);
}

/** The holder's matrícula of a dependent ("1234-01" → "1234"); itself for a holder. */
export function holderMembershipId(normalized: string): string {
  return normalized.split("-")[0]!;
}

/** True for a dependent's matrícula ("1234-01"). */
export function isDependentMembershipId(normalized: string): boolean {
  return normalized.includes("-");
}

const dotted = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * Display form with thousands dots: 104218 → 104.218, 104218-01 → 104.218-01. Accepts partial
 * input while typing (a trailing "-" stays so a dependent's suffix can be typed).
 */
export function formatMembershipId(value: string): string {
  const dependent = /^\s*([\d.\s]*?)\s*-\s*(\d{0,2})\s*$/.exec(value);
  if (dependent) return `${dotted(dependent[1]!.replace(/\D/g, ""))}-${dependent[2]}`;
  return dotted(value.replace(/\D/g, ""));
}

/** Initials for avatars: "Rafael Almeida" → "RA". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
