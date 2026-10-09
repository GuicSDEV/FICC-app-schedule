import { describe, expect, it } from "vitest";

import { translateIssue } from "./i18n";
import {
  cancelAffectedSchema,
  checkInSchema,
  copyWeekSchema,
  createBookingSchema,
  createCoachSchema,
  createFreezeSchema,
  createGuestPassSchema,
  createLessonSchema,
  createStaffSchema,
  createTimeSlotSchema,
  gateSearchQuerySchema,
  h2hQuerySchema,
  loginSchema,
  newsPostSchema,
  parseMembershipCsv,
  registerSchema,
  reportMatchSchema,
  resolveDisputeSchema,
  scheduleExceptionSchema,
  signupDecisionSchema,
  staffRoleSchema,
  updateLessonSchema,
} from "./schemas";
import { TennisRules } from "./sports";

const booking = {
  courtId: "court",
  timeSlotId: "slot",
  date: "2026-10-12",
};

describe("auth schemas", () => {
  it("normalizes the matrícula on login and register", () => {
    expect(loginSchema.parse({ kind: "member", membershipId: "104.218", password: "x" })).toEqual({
      kind: "member",
      membershipId: "104218",
      password: "x",
    });
    expect(
      registerSchema.safeParse({ membershipId: "104218", name: "Ana Lima", password: "short" })
        .success,
    ).toBe(false);
  });

  it("lower-cases staff emails", () => {
    const parsed = loginSchema.parse({ kind: "staff", email: " Admin@FICC.test ", password: "x" });
    expect(parsed.kind === "staff" && parsed.email).toBe("admin@ficc.test");
  });
});

describe("createBookingSchema", () => {
  it("needs exactly 1 other player for singles and 3 for doubles", () => {
    expect(
      createBookingSchema.safeParse({ ...booking, type: "SINGLES", playerIds: ["a"] }).success,
    ).toBe(true);
    expect(
      createBookingSchema.safeParse({ ...booking, type: "SINGLES", playerIds: ["a", "b"] }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({ ...booking, type: "DOUBLES", playerIds: ["a", "b", "c"] })
        .success,
    ).toBe(true);
    expect(
      createBookingSchema.safeParse({ ...booking, type: "DOUBLES", playerIds: ["a"] }).success,
    ).toBe(false);
  });

  it("rejects repeated players", () => {
    const result = createBookingSchema.safeParse({
      ...booking,
      type: "DOUBLES",
      playerIds: ["a", "a", "b"],
    });
    expect(result.error?.issues.map((issue) => translateIssue(issue))).toContain(
      "Jogador repetido",
    );
  });
});

describe("lesson schemas", () => {
  it("requires the first lesson's weekday in a weekly repeat", () => {
    const base = { ...booking, repeat: { weekdays: ["MON", "WED"] } };
    expect(createLessonSchema.safeParse(base).success).toBe(true);
    expect(createLessonSchema.safeParse({ ...base, repeat: { weekdays: ["TUE"] } }).success).toBe(
      false,
    );
    expect(
      createLessonSchema.safeParse({
        ...base,
        repeat: { weekdays: ["MON"], endDate: "2026-10-01" },
      }).success,
    ).toBe(false);
    expect(
      createLessonSchema.safeParse({ ...base, repeat: { weekdays: ["MON", "MON"] } }).success,
    ).toBe(false);
  });

  it("drops empty optional text", () => {
    expect(createLessonSchema.parse({ ...booking, note: "  " }).note).toBeUndefined();
  });

  it("validates moves and week copies", () => {
    expect(updateLessonSchema.safeParse({}).success).toBe(false);
    expect(updateLessonSchema.safeParse({ note: null }).success).toBe(true);
    expect(copyWeekSchema.safeParse({ weekStart: "2026-10-05" }).success).toBe(true);
    expect(copyWeekSchema.safeParse({ weekStart: "2026-10-06" }).success).toBe(false);
  });
});

describe("match schemas", () => {
  const report = {
    format: "SINGLES",
    sideA: ["a"],
    sideB: ["b"],
    score: [
      { a: 6, b: 4 },
      { a: 6, b: 3 },
    ],
    playedOn: "2026-10-07",
    surface: "SAIBRO",
  };

  it("parses a valid report whose sets the tennis rules accept", () => {
    const parsed = reportMatchSchema.parse(report);
    expect(TennisRules.scoreSchema.parse(parsed.score).winner).toBe("A");
  });

  it("rejects wrong team sizes, shared players and a missing surface", () => {
    expect(reportMatchSchema.safeParse({ ...report, format: "DOUBLES" }).success).toBe(false);
    expect(reportMatchSchema.safeParse({ ...report, sideB: ["a"] }).success).toBe(false);
    expect(reportMatchSchema.safeParse({ ...report, surface: undefined }).success).toBe(false);
    expect(
      reportMatchSchema.safeParse({ ...report, surface: undefined, courtId: "q5" }).success,
    ).toBe(true);
  });

  it("validates dispute resolutions and H2H queries", () => {
    expect(resolveDisputeSchema.safeParse({ action: "EDIT", score: report.score }).success).toBe(
      true,
    );
    // The schema only checks the shape; the sport's rules decide whether 6-5 is a set.
    const edited = resolveDisputeSchema.parse({ action: "EDIT", score: [{ a: 6, b: 5 }] });
    expect(
      edited.action === "EDIT" && TennisRules.scoreSchema.safeParse(edited.score).success,
    ).toBe(false);
    expect(resolveDisputeSchema.safeParse({ action: "EDIT", score: [] }).success).toBe(false);
    expect(h2hQuerySchema.safeParse({ a: "x", b: "x" }).success).toBe(false);
  });
});

describe("guest schemas", () => {
  const pass = { guestName: "Ana Paula Moura", documentType: "CPF", visitDate: "2026-10-10" };

  it("normalizes and validates the document", () => {
    expect(
      createGuestPassSchema.parse({ ...pass, documentNumber: "529.982.247-25" }).documentNumber,
    ).toBe("52998224725");
    expect(
      createGuestPassSchema.safeParse({ ...pass, documentNumber: "529.982.247-24" }).success,
    ).toBe(false);
    expect(
      createGuestPassSchema.safeParse({ ...pass, documentNumber: "52998224725", guestName: "Ana" })
        .success,
    ).toBe(false);
  });

  it("normalizes gate searches", () => {
    expect(gateSearchQuerySchema.parse({ document: "529.982" }).document).toBe("529982");
    expect(gateSearchQuerySchema.safeParse({ document: "1." }).success).toBe(false);
  });
});

describe("freeze and admin schemas", () => {
  it("requires a forward time window", () => {
    const freeze = {
      target: { scope: "SURFACE", surface: "SAIBRO" },
      reason: "RAIN",
      startsAt: "2026-10-08T14:00:00-03:00",
    };
    expect(createFreezeSchema.safeParse(freeze).success).toBe(true);
    expect(
      createFreezeSchema.safeParse({ ...freeze, endsAt: "2026-10-08T13:00:00-03:00" }).success,
    ).toBe(false);
    expect(cancelAffectedSchema.safeParse({}).success).toBe(false);
  });

  it("validates coach accounts", () => {
    const coach = {
      name: "Carla Mendes",
      email: "carla@ficc.test",
      password: "segredo123",
      displayName: "Carla",
      color: "#8b7cf6",
      courtIds: ["q2"],
    };
    expect(createCoachSchema.parse(coach).color).toBe("#8B7CF6");
    expect(createCoachSchema.safeParse({ ...coach, courtIds: [] }).success).toBe(false);
  });

  it("parses membership CSV files", () => {
    const result = parseMembershipCsv(
      "matricula;nome\n104.218;Rafael Almeida\n\nabc;Fulano\n200300\n104218,Rafael A.",
    );
    expect(result.rows).toEqual([
      { membershipId: "104218", holderName: "Rafael A." },
      { membershipId: "200300" },
    ]);
    expect(result.errors).toEqual([{ line: 4, value: "abc" }]);
  });
});

describe("club operations schemas", () => {
  it("date exceptions default to the weekday rules", () => {
    expect(scheduleExceptionSchema.parse({ date: "2026-12-25", closed: true })).toEqual({
      date: "2026-12-25",
      closed: true,
      slotTimes: null,
      mode: null,
      closedCourtIds: [],
      note: null,
    });
    expect(
      scheduleExceptionSchema.safeParse({ date: "2026-12-25", slotTimes: ["25:00"] }).success,
    ).toBe(false);
  });

  it("a sign-up rejection needs a reason", () => {
    expect(signupDecisionSchema.parse({ decision: "APPROVE" })).toEqual({ decision: "APPROVE" });
    const missing = signupDecisionSchema.safeParse({ decision: "REJECT", reason: " " });
    expect(missing.error?.issues[0]?.message).toBe("validation.reasonRequired");
  });

  it("news posts, staff accounts and check-ins", () => {
    expect(newsPostSchema.parse({ title: "Torneio", body: "Inscrições abertas" })).toMatchObject({
      photoUrls: [],
      eventDate: null,
      pinned: false,
      notify: true,
    });
    expect(newsPostSchema.safeParse({ title: "Oi", body: "x" }).success).toBe(false);
    const staff = createStaffSchema.safeParse({
      name: "Ana Secretaria",
      email: "ANA@ficc.test",
      password: "12345678",
      roleIds: [],
    });
    expect(staff.error?.issues[0]?.message).toBe("validation.pickRole");
    expect(checkInSchema.parse({ courtId: "c1" })).toEqual({ courtId: "c1", partnerIds: [] });
    expect(staffRoleSchema.safeParse({ name: "Caixa", permissions: ["NOPE"] }).success).toBe(false);
  });
});

describe("createTimeSlotSchema", () => {
  it("accepts a slot that ends by midnight", () => {
    expect(
      createTimeSlotSchema.safeParse({ startTime: "22:45", durationMinutes: 75 }).success,
    ).toBe(true);
  });

  it("rejects bad times, odd durations and slots running past midnight", () => {
    expect(createTimeSlotSchema.safeParse({ startTime: "7:15", durationMinutes: 75 }).success).toBe(
      false,
    );
    expect(
      createTimeSlotSchema.safeParse({ startTime: "07:15", durationMinutes: 10 }).success,
    ).toBe(false);
    const late = createTimeSlotSchema.safeParse({ startTime: "23:00", durationMinutes: 75 });
    expect(late.success).toBe(false);
    expect(late.error?.issues[0]?.message).toBe("validation.slotPastMidnight");
    expect(translateIssue(late.error!.issues[0]!)).toBe(
      "O horário precisa terminar até a meia-noite.",
    );
  });
});
