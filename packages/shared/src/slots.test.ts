import { describe, expect, it } from "vitest";

import {
  hasSlotEnded,
  isSlotPast,
  isValidTime,
  minutesToTime,
  overlapsSlot,
  slotEndsAt,
  slotEndTime,
  slotStartsAt,
  timeToMinutes,
} from "./slots";

describe("slotEndTime", () => {
  it("adds the slot duration to its start", () => {
    expect(slotEndTime({ startTime: "10:00", durationMinutes: 75 })).toBe("11:15");
    expect(slotEndTime({ startTime: "21:00", durationMinutes: 75 })).toBe("22:15");
    expect(slotEndTime({ startTime: "07:30", durationMinutes: 60 })).toBe("08:30");
  });
});

describe("time helpers", () => {
  it("converts between HH:mm and minutes", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(1439)).toBe("23:59");
  });

  it("validates HH:mm strictly", () => {
    expect(isValidTime("21:00")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:30")).toBe(false);
    expect(() => timeToMinutes("7:5")).toThrow(RangeError);
    expect(() => minutesToTime(1440)).toThrow(RangeError);
    expect(() => minutesToTime(12.5)).toThrow(RangeError);
  });
});

describe("slot instants", () => {
  const tz = "America/Sao_Paulo";
  const slot = { startTime: "18:30", durationMinutes: 75 };

  it("maps a club date + slot to UTC start and end", () => {
    expect(slotStartsAt("2026-10-08", slot, tz).toISOString()).toBe("2026-10-08T21:30:00.000Z");
    expect(slotEndsAt("2026-10-08", slot, tz).toISOString()).toBe("2026-10-08T22:45:00.000Z");
  });

  it("treats a slot as past once it has started", () => {
    expect(isSlotPast("2026-10-08", slot, new Date("2026-10-08T21:29:59Z"), tz)).toBe(false);
    expect(isSlotPast("2026-10-08", slot, new Date("2026-10-08T21:30:00Z"), tz)).toBe(true);
    expect(hasSlotEnded("2026-10-08", slot, new Date("2026-10-08T22:00:00Z"), tz)).toBe(false);
    expect(hasSlotEnded("2026-10-08", slot, new Date("2026-10-08T22:45:00Z"), tz)).toBe(true);
  });

  it("detects windows overlapping a slot", () => {
    const at = (iso: string) => new Date(iso);
    expect(
      overlapsSlot({ startsAt: at("2026-10-08T20:00:00Z"), endsAt: null }, "2026-10-08", slot, tz),
    ).toBe(true);
    expect(
      overlapsSlot(
        { startsAt: at("2026-10-08T20:00:00Z"), endsAt: at("2026-10-08T21:30:00Z") },
        "2026-10-08",
        slot,
        tz,
      ),
    ).toBe(false);
    expect(
      overlapsSlot({ startsAt: at("2026-10-08T22:45:00Z"), endsAt: null }, "2026-10-08", slot, tz),
    ).toBe(false);
    expect(
      overlapsSlot(
        { startsAt: at("2026-10-08T22:00:00Z"), endsAt: at("2026-10-08T23:00:00Z") },
        "2026-10-08",
        slot,
        tz,
      ),
    ).toBe(true);
  });
});
