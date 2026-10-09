import { describe, expect, it } from "vitest";

import {
  DEFAULT_SLOT_GRID,
  DEFAULT_SLOT_START_TIMES,
  hasSlotEnded,
  isSlotPast,
  isValidTime,
  minutesToTime,
  SLOT_DURATION_MINUTES,
  overlapsSlot,
  slotEndsAt,
  slotEndTime,
  slotStartsAt,
  timeToMinutes,
} from "./slots";

describe("DEFAULT_SLOT_GRID", () => {
  it("has the club's 8 slots of 75 minutes, in order", () => {
    expect(DEFAULT_SLOT_GRID.map((slot) => slot.startTime)).toEqual([
      "08:30",
      "10:00",
      "14:45",
      "16:00",
      "17:15",
      "18:30",
      "19:45",
      "21:00",
    ]);
    expect(DEFAULT_SLOT_GRID.every((slot) => slot.durationMinutes === SLOT_DURATION_MINUTES)).toBe(
      true,
    );
    expect(DEFAULT_SLOT_GRID.map((slot) => slot.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(DEFAULT_SLOT_START_TIMES).toHaveLength(8);
  });

  it("never overlaps", () => {
    for (let index = 1; index < DEFAULT_SLOT_GRID.length; index += 1) {
      const previous = DEFAULT_SLOT_GRID[index - 1]!;
      const current = DEFAULT_SLOT_GRID[index]!;
      expect(timeToMinutes(slotEndTime(previous))).toBeLessThanOrEqual(
        timeToMinutes(current.startTime),
      );
    }
  });

  it("has no slot between 11:15 and 14:45 and ends at 22:15", () => {
    const morningEnd = slotEndTime(DEFAULT_SLOT_GRID[1]!);
    expect(morningEnd).toBe("11:15");
    expect(DEFAULT_SLOT_GRID[2]!.startTime).toBe("14:45");
    expect(slotEndTime(DEFAULT_SLOT_GRID.at(-1)!)).toBe("22:15");
  });

  it("is immutable", () => {
    expect(Object.isFrozen(DEFAULT_SLOT_GRID)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SLOT_GRID[0])).toBe(true);
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
  const slot = { startTime: "18:30", durationMinutes: 75 };

  it("maps a club date + slot to UTC start and end", () => {
    expect(slotStartsAt("2026-10-08", slot).toISOString()).toBe("2026-10-08T21:30:00.000Z");
    expect(slotEndsAt("2026-10-08", slot).toISOString()).toBe("2026-10-08T22:45:00.000Z");
  });

  it("treats a slot as past once it has started", () => {
    expect(isSlotPast("2026-10-08", slot, new Date("2026-10-08T21:29:59Z"))).toBe(false);
    expect(isSlotPast("2026-10-08", slot, new Date("2026-10-08T21:30:00Z"))).toBe(true);
    expect(hasSlotEnded("2026-10-08", slot, new Date("2026-10-08T22:00:00Z"))).toBe(false);
    expect(hasSlotEnded("2026-10-08", slot, new Date("2026-10-08T22:45:00Z"))).toBe(true);
  });

  it("detects windows overlapping a slot", () => {
    const at = (iso: string) => new Date(iso);
    expect(
      overlapsSlot({ startsAt: at("2026-10-08T20:00:00Z"), endsAt: null }, "2026-10-08", slot),
    ).toBe(true);
    expect(
      overlapsSlot(
        { startsAt: at("2026-10-08T20:00:00Z"), endsAt: at("2026-10-08T21:30:00Z") },
        "2026-10-08",
        slot,
      ),
    ).toBe(false);
    expect(
      overlapsSlot({ startsAt: at("2026-10-08T22:45:00Z"), endsAt: null }, "2026-10-08", slot),
    ).toBe(false);
    expect(
      overlapsSlot(
        { startsAt: at("2026-10-08T22:00:00Z"), endsAt: at("2026-10-08T23:00:00Z") },
        "2026-10-08",
        slot,
      ),
    ).toBe(true);
  });
});
