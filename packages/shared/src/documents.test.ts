import { describe, expect, it } from "vitest";

import {
  formatDocument,
  isValidCpf,
  isValidDocument,
  maskDocument,
  normalizeDocument,
} from "./documents";
import {
  formatMembershipId,
  holderMembershipId,
  isDependentMembershipId,
  initialsOf,
  isValidMembershipId,
  normalizeMembershipId,
} from "./membership";

describe("documents", () => {
  it("normalizes CPF and RG input", () => {
    expect(normalizeDocument("CPF", "529.982.247-25")).toBe("52998224725");
    expect(normalizeDocument("RG", "12.345.678-x")).toBe("12345678X");
  });

  it("validates CPF check digits", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("validates RG loosely", () => {
    expect(isValidDocument("RG", "12345678X")).toBe(true);
    expect(isValidDocument("RG", "123")).toBe(false);
    expect(isValidDocument("CPF", "52998224725")).toBe(true);
  });

  it("masks documents for lists and formats them for the gate", () => {
    expect(maskDocument("CPF", "12345678909")).toBe("***.456.789-**");
    expect(maskDocument("RG", "123456789")).toBe("***567-**");
    expect(formatDocument("CPF", "12345678909")).toBe("123.456.789-09");
    expect(formatDocument("RG", "123456789")).toBe("123456789");
  });
});

describe("membership ids", () => {
  it("normalizes, validates and formats matrículas", () => {
    expect(normalizeMembershipId("104.218")).toBe("104218");
    expect(isValidMembershipId("104218")).toBe(true);
    expect(isValidMembershipId("12")).toBe(false);
    expect(formatMembershipId("104218")).toBe("104.218");
    expect(formatMembershipId("1042")).toBe("1.042");
    expect(formatMembershipId("10")).toBe("10");
  });

  it("handles dependents' matrículas (holder + dependents mode)", () => {
    expect(normalizeMembershipId("1.234-1")).toBe("1234-01");
    expect(normalizeMembershipId("104-218")).toBe("104218");
    expect(isValidMembershipId("1234-01")).toBe(false);
    expect(isValidMembershipId("1234-01", true)).toBe(true);
    expect(isValidMembershipId("1234-00", true)).toBe(false);
    expect(holderMembershipId("1234-02")).toBe("1234");
    expect(holderMembershipId("1234")).toBe("1234");
    expect(isDependentMembershipId("1234-02")).toBe(true);
    expect(isDependentMembershipId("1234")).toBe(false);
    expect(formatMembershipId("104218-01")).toBe("104.218-01");
    expect(formatMembershipId("104218-")).toBe("104.218-");
  });

  it("builds initials", () => {
    expect(initialsOf("Rafael Almeida")).toBe("RA");
    expect(initialsOf("Alan")).toBe("A");
    expect(initialsOf("  maria da silva ")).toBe("MS");
  });
});
