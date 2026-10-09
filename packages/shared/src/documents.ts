import type { GuestDocumentType } from "./enums";

/** CPF → digits only; RG → upper-case letters and digits. */
export function normalizeDocument(type: GuestDocumentType, value: string): string {
  return type === "CPF" ? value.replace(/\D/g, "") : value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Validates an 11-digit CPF including both check digits. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/** RG formats vary by state: accept 5–14 letters/digits after normalization. */
export function isValidRg(normalized: string): boolean {
  return /^[0-9A-Z]{5,14}$/.test(normalized);
}

export function isValidDocument(type: GuestDocumentType, normalized: string): boolean {
  return type === "CPF" ? isValidCpf(normalized) : isValidRg(normalized);
}

/** Full CPF for the gate view: 12345678909 → 123.456.789-09. */
export function formatDocument(type: GuestDocumentType, normalized: string): string {
  if (type === "CPF" && normalized.length === 11) {
    return `${normalized.slice(0, 3)}.${normalized.slice(3, 6)}.${normalized.slice(6, 9)}-${normalized.slice(9)}`;
  }
  return normalized;
}

/**
 * Masked document for every list outside the gate:
 * CPF 12345678909 → ***.456.789-**, RG 123456789 → ***567-**.
 */
export function maskDocument(type: GuestDocumentType, normalized: string): string {
  if (type === "CPF" && normalized.length === 11) {
    return `***.${normalized.slice(3, 6)}.${normalized.slice(6, 9)}-**`;
  }
  const visible = normalized.slice(
    Math.max(0, normalized.length - 5),
    Math.max(0, normalized.length - 2),
  );
  return `***${visible}-**`;
}
