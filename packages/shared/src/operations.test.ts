import { describe, expect, it } from "vitest";

import { DEFAULT_CLUB_SETTINGS, updateClubSettingsSchema } from "./club";
import {
  bookingAvailability,
  bookingOpensAt,
  type DateException,
  dayPlan,
  isSlotInPlan,
  slotsOfDay,
} from "./operations";
import { DEFAULT_STAFF_ROLES, hasPermission, permissionsOf } from "./staff";

const TZ = "America/Sao_Paulo";
const SLOTS = ["08:30", "10:00", "14:45", "16:00", "17:15", "18:30", "19:45", "21:00"].map(
  (startTime, index) => ({ id: `s${index}`, startTime }),
);
const settings = {
  ...DEFAULT_CLUB_SETTINGS,
  scheduleGrids: { SAT: ["07:15", "08:30", "10:00"], SUN: [] },
  dayModes: { SAT: "FREE_PLAY" as const },
};
const exception = (patch: Partial<DateException>): DateException => ({
  date: "2026-10-12",
  closed: false,
  slotTimes: null,
  mode: null,
  closedCourtIds: [],
  note: null,
  ...patch,
});

describe("day plans", () => {
  it("weekdays without a grid use every slot in booking mode", () => {
    const plan = dayPlan("2026-10-14", settings); // Wednesday
    expect(plan).toMatchObject({ weekday: "WED", mode: "BOOKING", closed: false, slotTimes: null });
    expect(slotsOfDay(SLOTS, plan)).toHaveLength(8);
    expect(isSlotInPlan(plan, "21:00")).toBe(true);
  });

  it("weekend grids and modes differ from weekdays", () => {
    const saturday = dayPlan("2026-10-17", settings);
    expect(saturday.mode).toBe("FREE_PLAY");
    expect(saturday.slotTimes).toEqual(["07:15", "08:30", "10:00"]);
    expect(slotsOfDay(SLOTS, saturday).map((slot) => slot.startTime)).toEqual(["08:30", "10:00"]);
    expect(isSlotInPlan(saturday, "14:45")).toBe(false);
    const sunday = dayPlan("2026-10-18", settings);
    expect(sunday.closed).toBe(true);
    expect(slotsOfDay(SLOTS, sunday)).toEqual([]);
    expect(isSlotInPlan(sunday, "08:30")).toBe(false);
  });

  it("date exceptions override the grid, the mode and close courts or the club", () => {
    const holiday = dayPlan("2026-10-12", settings, exception({ closed: true, note: "Feriado" }));
    expect(holiday).toMatchObject({ closed: true, note: "Feriado", exception: true });
    const event = dayPlan(
      "2026-10-12",
      settings,
      exception({ slotTimes: ["10:00", "08:30"], mode: "FREE_PLAY", closedCourtIds: ["q1"] }),
    );
    expect(event).toMatchObject({ mode: "FREE_PLAY", slotTimes: ["08:30", "10:00"] });
    expect(isSlotInPlan(event, "08:30", "q1")).toBe(false);
    expect(isSlotInPlan(event, "08:30", "q2")).toBe(true);
    const keepsGrid = dayPlan("2026-10-17", settings, exception({ date: "2026-10-17" }));
    expect(keepsGrid).toMatchObject({ mode: "FREE_PLAY", slotTimes: ["07:15", "08:30", "10:00"] });
  });
});

describe("booking opening", () => {
  const rule = { daysBefore: 1, time: "07:00" };

  it("opens N days before at the club's time", () => {
    expect(bookingOpensAt("2026-10-15", rule, TZ)?.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    expect(bookingOpensAt("2026-10-15", null, TZ)).toBeNull();
  });

  it("is open only inside the window and after the opening instant (server clock)", () => {
    const withRule = { bookingWindowDays: 3, bookingOpening: rule };
    const before = new Date("2026-10-14T09:59:59.000Z");
    const after = new Date("2026-10-14T10:00:00.000Z");
    expect(bookingAvailability("2026-10-15", before, withRule, TZ)).toMatchObject({
      inWindow: true,
      open: false,
    });
    expect(bookingAvailability("2026-10-15", after, withRule, TZ).open).toBe(true);
    expect(bookingAvailability("2026-10-14", after, withRule, TZ).open).toBe(true);
    expect(bookingAvailability("2026-10-17", after, withRule, TZ)).toMatchObject({
      inWindow: false,
      open: false,
    });
    expect(bookingAvailability("2026-10-13", after, withRule, TZ).inWindow).toBe(false);
    const noRule = { bookingWindowDays: 3, bookingOpening: null };
    expect(bookingAvailability("2026-10-16", before, noRule, TZ)).toEqual({
      inWindow: true,
      opensAt: null,
      open: true,
    });
  });
});

describe("staff roles", () => {
  it("ships Secretaria, Diretoria, Professor and Super admin", () => {
    expect(DEFAULT_STAFF_ROLES.map((role) => role.key)).toEqual([
      "SECRETARIA",
      "DIRETORIA",
      "PROFESSOR",
      "SUPER_ADMIN",
    ]);
    const diretoria = DEFAULT_STAFF_ROLES.find((role) => role.key === "DIRETORIA")!;
    expect(diretoria.permissions).not.toContain("PLATFORM_MANAGE");
    expect(diretoria.permissions).toContain("SETTINGS_MANAGE");
  });

  it("unions permissions and checks them", () => {
    const permissions = permissionsOf([
      { permissions: ["NEWS_MANAGE", "BOOKINGS_MANAGE"] },
      { permissions: ["BOOKINGS_MANAGE", "unknown"] },
    ]);
    expect(permissions).toEqual(["BOOKINGS_MANAGE", "NEWS_MANAGE"]);
    expect(hasPermission({ permissions }, "NEWS_MANAGE")).toBe(true);
    expect(hasPermission({ permissions }, "SETTINGS_MANAGE")).toBe(false);
    expect(hasPermission(null, "NEWS_MANAGE")).toBe(false);
  });
});

describe("settings updates", () => {
  it("accepts a partial update and validates the rules", () => {
    expect(
      updateClubSettingsSchema.parse({ bookingOpening: { daysBefore: 0, time: "07:00" } }),
    ).toEqual({ bookingOpening: { daysBefore: 0, time: "07:00" } });
    expect(updateClubSettingsSchema.safeParse({ scheduleGrids: { SAT: ["7h"] } }).success).toBe(
      false,
    );
    expect(updateClubSettingsSchema.safeParse({ dayModes: { XYZ: "BOOKING" } }).success).toBe(
      false,
    );
  });
});
