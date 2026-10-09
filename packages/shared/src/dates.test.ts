import { describe, expect, it } from "vitest";

import {
  addDays,
  clubInstant,
  clubTimeOfDay,
  clubToday,
  dateRange,
  daysBetween,
  endOfClubDay,
  fromDbDate,
  isIsoDate,
  isoDateSchema,
  startOfWeek,
  toDbDate,
  weekdayOf,
} from "./dates";

const SAO_PAULO = "America/Sao_Paulo";

describe("club dates", () => {
  it("uses the São Paulo calendar day, not UTC", () => {
    // 01:30 UTC on Oct 9 is still 22:30 on Oct 8 in São Paulo (UTC-3).
    const instant = new Date("2026-10-09T01:30:00Z");
    expect(clubToday(instant, SAO_PAULO)).toBe("2026-10-08");
    expect(clubTimeOfDay(instant, SAO_PAULO)).toBe("22:30");
  });

  it("follows the club's own time zone", () => {
    const instant = new Date("2026-10-09T01:30:00Z");
    expect(clubToday(instant, "Europe/Lisbon")).toBe("2026-10-09");
    expect(clubTimeOfDay(instant, "Europe/Lisbon")).toBe("02:30");
    expect(clubInstant("2026-10-08", "18:30", "Europe/Lisbon").toISOString()).toBe(
      "2026-10-08T17:30:00.000Z",
    );
  });

  it("converts club-local times to UTC instants", () => {
    expect(clubInstant("2026-10-08", "18:30", SAO_PAULO).toISOString()).toBe(
      "2026-10-08T21:30:00.000Z",
    );
    expect(endOfClubDay("2026-10-08", SAO_PAULO).toISOString()).toBe("2026-10-09T02:59:59.999Z");
  });

  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysBetween("2026-10-08", "2026-10-01")).toBe(-7);
    expect(dateRange("2026-10-08", "2026-10-10")).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
    ]);
  });

  it("knows weekdays and week starts (Monday)", () => {
    expect(weekdayOf("2026-10-08")).toBe("THU");
    expect(weekdayOf("2026-10-11")).toBe("SUN");
    expect(startOfWeek("2026-10-08")).toBe("2026-10-05");
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05");
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05");
  });

  it("round-trips @db.Date values", () => {
    expect(fromDbDate(toDbDate("2026-10-08"))).toBe("2026-10-08");
  });

  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("08/10/2026")).toBe(false);
    expect(isoDateSchema.safeParse("2026-13-01").success).toBe(false);
  });
});
