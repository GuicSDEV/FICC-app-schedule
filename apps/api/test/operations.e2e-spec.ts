import { Role } from "@ficc/db";
import {
  type ClubSettings,
  type CourtsNow,
  DEFAULT_CLUB_SETTINGS,
  type ScheduleDay,
} from "@ficc/shared";
import { hash } from "argon2";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";

import { TokensService } from "../src/auth/tokens.service";
import { FreePlayService } from "../src/free-play/free-play.service";
import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createCoach,
  createMember,
  createStaff,
  resetDatabase,
  seedClub,
  TEST_PASSWORD,
} from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo (the fake clock's default). */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";
const TUESDAY = "2030-03-05";
const WEDNESDAY = "2030-03-06";
const SATURDAY = "2030-03-09";

const RULES: Partial<ClubSettings> = {
  scheduleGrids: {
    MON: ["08:30", "10:00", "14:45", "16:00", "17:15", "18:30", "19:45", "21:00"],
    TUE: ["08:30", "10:00", "14:45", "16:00", "17:15", "18:30", "19:45", "21:00"],
    WED: ["08:30", "10:00", "14:45", "16:00", "17:15", "18:30", "19:45", "21:00"],
    SAT: ["08:30", "10:00", "14:45", "16:00"],
  },
  dayModes: { SAT: "FREE_PLAY" },
  bookingOpening: { daysBefore: 1, time: "07:00" },
  bookingWindowDays: 14,
  maxActiveBookings: 3,
  maxBookingsPerDay: 1,
};

describe("Club operations (Phase 9.8)", () => {
  let ctx: TestContext;
  let club: Club;
  let admin$: TestAgent;

  const patchSettings = async (patch: Partial<ClubSettings>) => {
    await admin$.patch(ctx.api("/admin/settings")).send(patch).expect(200);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set(MONDAY_9AM);
    club = await seedClub(ctx);
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Super Admin");
    admin$ = await ctx.loginStaff("admin@ficc.test");
    await patchSettings(RULES);
  });

  describe("slot catalogue", () => {
    it("staff add and retire start times; grids and exceptions never overlap", async () => {
      const added = await admin$
        .post(ctx.api("/admin/time-slots"))
        .send({ startTime: "07:15", durationMinutes: 75 })
        .expect(201);
      expect(added.body).toMatchObject({
        startTime: "07:15",
        endTime: "08:30",
        sortOrder: 1,
        isActive: true,
      });
      const courts = await admin$.get(ctx.api("/courts")).expect(200);
      expect((courts.body as { slots: { startTime: string }[] }).slots[0]?.startTime).toBe("07:15");

      const duplicate = await admin$
        .post(ctx.api("/admin/time-slots"))
        .send({ startTime: "07:15", durationMinutes: 60 })
        .expect(409);
      expect(duplicate.body.code).toBe("TIME_SLOT_EXISTS");

      // Thursday has no grid of its own (every active slot): 09:45 would overlap 10:00 there.
      const overlapping = await admin$
        .post(ctx.api("/admin/time-slots"))
        .send({ startTime: "09:45", durationMinutes: 75 })
        .expect(422);
      expect(overlapping.body.code).toBe("GRID_OVERLAP");

      const weekdayGrid = RULES.scheduleGrids!.MON!;
      await patchSettings({
        scheduleGrids: {
          ...RULES.scheduleGrids,
          THU: weekdayGrid,
          FRI: weekdayGrid,
          SUN: ["07:15", "08:30"],
        },
      });
      const brunch = await admin$
        .post(ctx.api("/admin/time-slots"))
        .send({ startTime: "09:45", durationMinutes: 75 })
        .expect(201);

      const badGrid = await admin$
        .patch(ctx.api("/admin/settings"))
        .send({ scheduleGrids: { SAT: ["08:30", "09:45", "10:00"] } })
        .expect(422);
      expect(badGrid.body.code).toBe("GRID_OVERLAP");
      const badException = await admin$
        .put(ctx.api("/schedule-exceptions"))
        .send({ date: WEDNESDAY, slotTimes: ["09:45", "10:00"] })
        .expect(422);
      expect(badException.body.code).toBe("GRID_OVERLAP");

      // A start time still used by a grid stays; an unused one is retired and can come back.
      const inUse = await admin$
        .patch(ctx.api(`/admin/time-slots/${added.body.id}`))
        .send({ isActive: false })
        .expect(409);
      expect(inUse.body.code).toBe("TIME_SLOT_IN_USE");
      const retired = await admin$
        .patch(ctx.api(`/admin/time-slots/${brunch.body.id}`))
        .send({ isActive: false })
        .expect(200);
      expect(retired.body.isActive).toBe(false);
      const list = await admin$.get(ctx.api("/admin/time-slots")).expect(200);
      expect(list.body).toHaveLength(10);
      await admin$
        .patch(ctx.api(`/admin/time-slots/${brunch.body.id}`))
        .send({ isActive: true })
        .expect(200);

      const member = await createMember(ctx.prisma, { membershipId: "5099" });
      const member$ = await ctx.loginMember(member.membershipId!);
      await member$
        .post(ctx.api("/admin/time-slots"))
        .send({ startTime: "06:00", durationMinutes: 75 })
        .expect(403);
    });
  });

  describe("schedules per day", () => {
    it("weekday and weekend grids differ, Saturday is free play and rules are validated", async () => {
      const member = await createMember(ctx.prisma, { membershipId: "5001" });
      const member$ = await ctx.loginMember(member.membershipId!);
      const monday = await member$
        .get(ctx.api("/schedule"))
        .query({ date: "2030-03-04" })
        .expect(200);
      const saturday = await member$
        .get(ctx.api("/schedule"))
        .query({ date: SATURDAY })
        .expect(200);
      expect((monday.body as ScheduleDay).slots).toHaveLength(8);
      expect((saturday.body as ScheduleDay).slots.map((slot) => slot.startTime)).toEqual([
        "08:30",
        "10:00",
        "14:45",
        "16:00",
      ]);
      expect((saturday.body as ScheduleDay).plan.mode).toBe("FREE_PLAY");
      expect((saturday.body as ScheduleDay).plan.bookingOpen).toBe(false);

      const unknown = await admin$
        .patch(ctx.api("/admin/settings"))
        .send({ scheduleGrids: { SUN: ["07:00"] } })
        .expect(422);
      expect(unknown.body.code).toBe("GRID_SLOT_UNKNOWN");
      const club$ = await ctx.http().get(ctx.api("/club")).expect(200);
      expect(club$.body.settings.dayModes).toEqual({ SAT: "FREE_PLAY" });
    });

    it("date exceptions close courts or the whole day", async () => {
      const [ana, bia] = [
        await createMember(ctx.prisma, { membershipId: "5101" }),
        await createMember(ctx.prisma, { membershipId: "5102" }),
      ];
      const ana$ = await ctx.loginMember(ana.membershipId!);
      await admin$
        .put(ctx.api("/schedule-exceptions"))
        .send({ date: TUESDAY, closedCourtIds: [club.courts.Q5.id], note: "Saibro novo" })
        .expect(200);
      const day = (await ana$.get(ctx.api("/schedule")).query({ date: TUESDAY }).expect(200))
        .body as ScheduleDay;
      expect(day.plan.note).toBe("Saibro novo");
      expect(
        day.cells
          .filter((cell) => cell.courtId === club.courts.Q5.id)
          .every((cell) => cell.state === "closed"),
      ).toBe(true);
      const closedCourt = await ana$
        .post(ctx.api("/bookings"))
        .send({
          courtId: club.courts.Q5.id,
          timeSlotId: club.slots["18:30"]!.id,
          date: TUESDAY,
          type: "SINGLES",
          playerIds: [bia.id],
        })
        .expect(409);
      expect(closedCourt.body.code).toBe("COURT_CLOSED_TODAY");

      await admin$
        .put(ctx.api("/schedule-exceptions"))
        .send({ date: TUESDAY, closed: true, note: "Feriado" })
        .expect(200);
      const holiday = (await ana$.get(ctx.api("/schedule")).query({ date: TUESDAY }).expect(200))
        .body as ScheduleDay;
      expect(holiday.slots).toEqual([]);
      expect(holiday.plan.closed).toBe(true);
      const list = await ana$
        .get(ctx.api("/schedule-exceptions"))
        .query({ from: TUESDAY, to: WEDNESDAY })
        .expect(200);
      expect(list.body).toHaveLength(1);
      await ana$
        .put(ctx.api("/schedule-exceptions"))
        .send({ date: WEDNESDAY, closed: true })
        .expect(403);
    });
  });

  describe("booking opening", () => {
    it("shows the opening time and enforces it with the server clock", async () => {
      const [ana, bia] = [
        await createMember(ctx.prisma, { membershipId: "5201" }),
        await createMember(ctx.prisma, { membershipId: "5202" }),
      ];
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const wednesday = (
        await ana$.get(ctx.api("/schedule")).query({ date: WEDNESDAY }).expect(200)
      ).body as ScheduleDay;
      expect(wednesday.plan).toMatchObject({
        bookingOpen: false,
        inWindow: true,
        opensAt: "2030-03-05T10:00:00.000Z",
        serverNow: MONDAY_9AM,
      });
      const book = () =>
        ana$.post(ctx.api("/bookings")).send({
          courtId: club.courts.Q1.id,
          timeSlotId: club.slots["18:30"]!.id,
          date: WEDNESDAY,
          type: "SINGLES",
          playerIds: [bia.id],
        });
      const early = await book().expect(422);
      expect(early.body).toMatchObject({
        code: "BOOKING_NOT_OPEN_YET",
        message: "As reservas para este dia abrem em 05/03 às 07:00.",
      });
      ctx.clock.set("2030-03-05T09:59:59.000Z");
      expect((await book().expect(422)).body.code).toBe("BOOKING_NOT_OPEN_YET");
      ctx.clock.set("2030-03-05T10:00:00.000Z");
      await book().expect(201);

      // One booking per member per day.
      const second = await ana$
        .post(ctx.api("/bookings"))
        .send({
          courtId: club.courts.Q2.id,
          timeSlotId: club.slots["21:00"]!.id,
          date: WEDNESDAY,
          type: "SINGLES",
          playerIds: [bia.id],
        })
        .expect(422);
      expect(second.body.code).toBe("MAX_BOOKINGS_PER_DAY");
    });

    it("load test: 150 members book at the same second, fairly and without double bookings", async () => {
      const passwordHash = await hash(TEST_PASSWORD);
      const rows = Array.from({ length: 300 }, (_, index) => ({
        role: Role.MEMBER,
        membershipId: String(600000 + index),
        name: `Sócio Carga ${index}`,
        passwordHash,
      }));
      await ctx.prisma.validMembershipId.createMany({
        data: rows.map((row) => ({ membershipId: row.membershipId })),
      });
      const users = await ctx.prisma.user.createManyAndReturn({ data: rows });
      const bookers = users.slice(0, 150);
      const opponents = users.slice(150);
      const tokens = ctx.app.get(TokensService);
      const server = ctx.app.getHttpServer();
      const courts = Object.values(club.courts);

      // Wednesday opens Tuesday 07:00: everyone fires at exactly that second.
      ctx.clock.set("2030-03-05T10:00:00.000Z");
      const started = Date.now();
      const responses = await Promise.all(
        bookers.map((user, index) =>
          request(server)
            .post(ctx.api("/bookings"))
            .set("Cookie", `ficc_at=${tokens.signAccess(user)}`)
            .send({
              courtId: courts[index % courts.length]!.id,
              timeSlotId: club.slots["18:30"]!.id,
              date: WEDNESDAY,
              type: "SINGLES",
              playerIds: [opponents[index]!.id],
            }),
        ),
      );
      const elapsed = Date.now() - started;

      const statuses = responses.map((response) => response.status);
      const won = responses.filter((response) => response.status === 201);
      const taken = responses.filter((response) => response.body.code === "SLOT_TAKEN");
      // Every request gets a clear answer: one winner per court, "just taken" for the rest.
      expect(statuses.filter((status) => status >= 500)).toEqual([]);
      expect(won).toHaveLength(courts.length);
      expect(taken).toHaveLength(150 - courts.length);
      expect(new Set(won.map((response) => response.body.court.id)).size).toBe(courts.length);
      // The next free options come with the refusal (other times that evening).
      for (const [index, response] of responses.entries()) {
        if (response.status === 201) continue;
        const asked = courts[index % courts.length]!.id;
        expect(response.body.details.alternatives.length).toBeGreaterThan(0);
        expect(
          response.body.details.alternatives.some(
            (option: { courtId: string; timeSlotId: string }) =>
              option.courtId === asked && option.timeSlotId === club.slots["18:30"]!.id,
          ),
        ).toBe(false);
      }
      const occupancies = await ctx.prisma.slotOccupancy.count({
        where: { timeSlotId: club.slots["18:30"]!.id, bookingId: { not: null } },
      });
      expect(occupancies).toBe(courts.length);
      expect(await ctx.prisma.booking.count()).toBe(courts.length);
      console.log(`150 simultaneous booking attempts answered in ${elapsed} ms`);
      expect(elapsed).toBeLessThan(60_000);
    }, 120_000);

    it("rate-limits repeated booking attempts", async () => {
      const [ana, bia] = [
        await createMember(ctx.prisma, { membershipId: "5301" }),
        await createMember(ctx.prisma, { membershipId: "5302" }),
      ];
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const codes: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await ana$.post(ctx.api("/bookings")).send({
          courtId: club.courts.Q1.id,
          timeSlotId: club.slots["18:30"]!.id,
          date: WEDNESDAY,
          type: "SINGLES",
          playerIds: [bia.id],
        });
        codes.push(response.status);
      }
      expect(codes.slice(0, 5).every((code) => code === 422)).toBe(true);
      expect(codes[5]).toBe(429);
    });
  });

  describe("free play", () => {
    it("Saturday works with check-in, the queue, the claim window and auto check-out", async () => {
      await patchSettings({
        freePlay: { queueEnabled: true, claimMinutes: 5, sessionMinutes: 75 },
      });
      // Saturday 09:00 in São Paulo.
      ctx.clock.set("2030-03-09T12:00:00.000Z");
      const members = [];
      for (let index = 0; index < 14; index += 1) {
        members.push(await createMember(ctx.prisma, { membershipId: String(7000 + index) }));
      }
      const agents = await Promise.all(
        members.map((member) => ctx.loginMember(member.membershipId!)),
      );
      const courts = Object.values(club.courts);
      const checkIns: string[] = [];
      for (const [index, court] of courts.entries()) {
        const response = await agents[index * 2]!.post(ctx.api("/free-play/check-ins"))
          .send({ courtId: court.id, partnerIds: [members[index * 2 + 1]!.id] })
          .expect(201);
        checkIns.push(response.body.id);
      }
      const [xavier$, yara$] = [agents[12]!, agents[13]!];
      const busy = await xavier$
        .post(ctx.api("/free-play/check-ins"))
        .send({ courtId: courts[0]!.id })
        .expect(409);
      expect(busy.body.code).toBe("COURT_BUSY");
      const noBooking = await xavier$
        .post(ctx.api("/bookings"))
        .send({
          courtId: courts[0]!.id,
          timeSlotId: club.slots["10:00"]!.id,
          date: SATURDAY,
          type: "SINGLES",
          playerIds: [members[13]!.id],
        })
        .expect(409);
      expect(noBooking.body.code).toBe("FREE_PLAY_DAY");

      expect((await xavier$.post(ctx.api("/free-play/queue")).expect(201)).body).toMatchObject({
        status: "WAITING",
        position: 1,
      });
      ctx.clock.advance(20_000);
      expect((await yara$.post(ctx.api("/free-play/queue")).expect(201)).body.position).toBe(2);
      expect((await xavier$.post(ctx.api("/free-play/queue")).expect(409)).body.code).toBe(
        "ALREADY_IN_QUEUE",
      );

      // Court 1 frees up: Xavier (first in line) gets it for 5 minutes.
      await agents[0]!.post(ctx.api(`/free-play/check-ins/${checkIns[0]}/check-out`)).expect(204);
      const now = (await xavier$.get(ctx.api("/free-play/now")).expect(200)).body as CourtsNow;
      expect(now.queue.me).toMatchObject({ status: "OFFERED", offeredCourtId: courts[0]!.id });
      expect(now.courts[0]).toMatchObject({ state: "offered" });
      const offered = await ctx.prisma.notification.findFirst({
        where: { userId: members[12]!.id, type: "COURT_AVAILABLE" },
      });
      expect(offered?.payload).toMatchObject({ courtName: courts[0]!.name });
      const held = await yara$
        .post(ctx.api("/free-play/check-ins"))
        .send({ courtId: courts[0]!.id })
        .expect(409);
      expect(held.body.code).toBe("COURT_HELD");

      // Xavier lets the 5 minutes pass: the court goes to Yara.
      ctx.clock.advance(6 * 60_000);
      await ctx.inClub(() => ctx.app.get(FreePlayService).tick());
      const yaraNow = (await yara$.get(ctx.api("/free-play/now")).expect(200)).body as CourtsNow;
      expect(yaraNow.queue.me).toMatchObject({ status: "OFFERED", offeredCourtId: courts[0]!.id });
      await yara$
        .post(ctx.api("/free-play/check-ins"))
        .send({ courtId: courts[0]!.id })
        .expect(201);
      const afterClaim = (await yara$.get(ctx.api("/free-play/now")).expect(200)).body as CourtsNow;
      expect(afterClaim.queue.me).toBeNull();
      expect(afterClaim.myCheckIn?.courtId).toBe(courts[0]!.id);

      // Sessions end on their own after 75 minutes.
      ctx.clock.advance(76 * 60_000);
      await ctx.inClub(() => ctx.app.get(FreePlayService).tick());
      const later = (await xavier$.get(ctx.api("/free-play/now")).expect(200)).body as CourtsNow;
      expect(later.courts.every((court) => court.state === "free")).toBe(true);
      expect((await xavier$.post(ctx.api("/free-play/queue")).expect(409)).body.code).toBe(
        "COURTS_AVAILABLE",
      );
    });

    it("is refused on booking days and when the queue is off", async () => {
      const member = await createMember(ctx.prisma, { membershipId: "7100" });
      const member$ = await ctx.loginMember(member.membershipId!);
      const refused = await member$
        .post(ctx.api("/free-play/check-ins"))
        .send({ courtId: club.courts.Q1.id })
        .expect(409);
      expect(refused.body.code).toBe("NOT_FREE_PLAY_NOW");
      await patchSettings({
        freePlay: { queueEnabled: false, claimMinutes: 5, sessionMinutes: 75 },
      });
      expect((await member$.post(ctx.api("/free-play/queue")).expect(409)).body.code).toBe(
        "QUEUE_DISABLED",
      );
    });
  });

  describe("sign-up approval and dependents", () => {
    it("self sign-ups wait for approval; staff approve or reject with a reason", async () => {
      await ctx.prisma.validMembershipId.createMany({
        data: [{ membershipId: "8001", holderName: "Paula Nogueira" }, { membershipId: "8002" }],
      });
      await createStaff(ctx.prisma, Role.ADMIN, "secretaria@ficc.test", "Secretaria", [
        "SECRETARIA",
      ]);
      const register = (membershipId: string, name: string) =>
        ctx
          .http()
          .post(ctx.api("/auth/register"))
          .send({ membershipId, name, password: TEST_PASSWORD });
      await register("8001", "Paula Nogueira").expect(202, {
        status: "PENDING",
        rejectionReason: null,
      });
      await register("8002", "Fulano de Tal").expect(202);
      const pendingLogin = await ctx
        .http()
        .post(ctx.api("/auth/login"))
        .send({ kind: "member", membershipId: "8001", password: TEST_PASSWORD })
        .expect(403);
      expect(pendingLogin.body.code).toBe("SIGNUP_PENDING");

      const secretaria$ = await ctx.loginStaff("secretaria@ficc.test");
      const pending = await secretaria$.get(ctx.api("/admin/members/pending")).expect(200);
      expect(pending.body.map((entry: { membershipId: string }) => entry.membershipId)).toEqual([
        "8001",
        "8002",
      ]);
      expect(pending.body[0].listedName).toBe("Paula Nogueira");
      const [paula, fulano] = pending.body as { id: string }[];
      await secretaria$
        .post(ctx.api(`/admin/members/${paula!.id}/decision`))
        .send({ decision: "APPROVE" })
        .expect(204);
      const rejectNoReason = await secretaria$
        .post(ctx.api(`/admin/members/${fulano!.id}/decision`))
        .send({ decision: "REJECT", reason: "" })
        .expect(400);
      expect(rejectNoReason.body.code).toBe("VALIDATION_FAILED");
      await secretaria$
        .post(ctx.api(`/admin/members/${fulano!.id}/decision`))
        .send({ decision: "REJECT", reason: "Matrícula de outra pessoa" })
        .expect(204);

      const paula$ = await ctx.loginMember("8001");
      const notifications = await paula$.get(ctx.api("/notifications")).expect(200);
      expect(notifications.body.items[0].type).toBe("MEMBER_APPROVED");
      const rejected = await ctx
        .http()
        .post(ctx.api("/auth/login"))
        .send({ kind: "member", membershipId: "8002", password: TEST_PASSWORD })
        .expect(403);
      expect(rejected.body).toMatchObject({
        code: "SIGNUP_REJECTED",
        message: "Seu cadastro não foi aprovado: Matrícula de outra pessoa",
      });
    });

    it("dependents sign up under a registered holder only when the club enables it", async () => {
      await createMember(ctx.prisma, { membershipId: "1234", name: "Titular Silva" });
      const signUp = () =>
        ctx
          .http()
          .post(ctx.api("/auth/register"))
          .send({ membershipId: "1234-1", name: "Filha Silva", password: TEST_PASSWORD });
      expect((await signUp().expect(422)).body.code).toBe("DEPENDENTS_DISABLED");
      await patchSettings({ dependentsEnabled: true });
      await signUp().expect(202);
      const pending = await admin$.get(ctx.api("/admin/members/pending")).expect(200);
      expect(pending.body[0]).toMatchObject({
        membershipId: "1234-01",
        holderMembershipId: "1234",
      });
      await admin$
        .post(ctx.api(`/admin/members/${pending.body[0].id}/decision`))
        .send({ decision: "APPROVE" })
        .expect(204);
      const members = await admin$.get(ctx.api("/admin/members")).query({ q: "1234" }).expect(200);
      const holder = members.body.find(
        (entry: { player: { membershipId: string } }) => entry.player.membershipId === "1234",
      );
      expect(holder.dependents).toEqual([
        expect.objectContaining({ name: "Filha Silva", membershipId: "1234-01" }),
      ]);
      const orphan = await ctx
        .http()
        .post(ctx.api("/auth/register"))
        .send({ membershipId: "9999-01", name: "Sem Titular", password: TEST_PASSWORD })
        .expect(404);
      expect(orphan.body.code).toBe("HOLDER_NOT_REGISTERED");
    });
  });

  describe("staff permissions", () => {
    it("each default role sees only what it should, and staff actions are audited", async () => {
      await createStaff(ctx.prisma, Role.ADMIN, "secretaria@ficc.test", "Secretaria", [
        "SECRETARIA",
      ]);
      await createStaff(ctx.prisma, Role.ADMIN, "diretoria@ficc.test", "Diretoria", ["DIRETORIA"]);
      await createCoach(ctx.prisma, {
        name: "Alan",
        email: "alan@ficc.test",
        courtIds: [club.courts.Q5.id],
      });
      const secretaria$ = await ctx.loginStaff("secretaria@ficc.test");
      const diretoria$ = await ctx.loginStaff("diretoria@ficc.test");
      const coach$ = await ctx.loginStaff("alan@ficc.test");

      const me = await secretaria$.get(ctx.api("/auth/me")).expect(200);
      expect(me.body.permissions).toEqual([
        "BOOKINGS_MANAGE",
        "COURTS_MANAGE",
        "NEWS_MANAGE",
        "MEMBERS_APPROVE",
        "GUESTS_MANAGE",
      ]);
      // Secretaria: courts/rain, news, approvals, guests — not rules, members list, staff or tournaments.
      await secretaria$.get(ctx.api("/admin/freezes")).expect(200);
      await secretaria$.get(ctx.api("/admin/members/pending")).expect(200);
      await secretaria$.get(ctx.api("/admin/guests/hosts")).expect(200);
      const notice = await secretaria$
        .post(ctx.api("/news"))
        .send({ title: "Aviso geral", body: "Texto", notify: false })
        .expect(201);
      // Personal actions (reading a post) are not staff actions: they stay out of the audit log.
      await secretaria$.post(ctx.api(`/news/${notice.body.id}/read`)).expect(204);
      await secretaria$
        .patch(ctx.api("/admin/settings"))
        .send({ maxBookingsPerDay: 2 })
        .expect(403);
      await secretaria$.get(ctx.api("/admin/members")).expect(403);
      await secretaria$.get(ctx.api("/admin/staff")).expect(403);
      await secretaria$.get(ctx.api("/admin/disputes")).expect(403);
      await secretaria$
        .post(ctx.api("/tournaments"))
        .send({ name: "Torneio X", startDate: "2030-04-01", endDate: "2030-04-02" })
        .expect(403);

      // Diretoria: everything but the platform.
      await diretoria$.patch(ctx.api("/admin/settings")).send({ maxBookingsPerDay: 2 }).expect(200);
      await diretoria$.get(ctx.api("/admin/members")).expect(200);
      await diretoria$
        .post(ctx.api("/tournaments"))
        .send({ name: "Torneio X", startDate: "2030-04-01", endDate: "2030-04-02" })
        .expect(201);
      const roles = (await diretoria$.get(ctx.api("/admin/staff/roles")).expect(200)).body as {
        id: string;
        key: string;
      }[];
      await diretoria$
        .post(ctx.api("/admin/staff/roles"))
        .send({ name: "Caixa", permissions: ["BOOKINGS_MANAGE"] })
        .expect(403);
      const superRole = roles.find((role) => role.key === "SUPER_ADMIN")!;
      await diretoria$
        .post(ctx.api("/admin/staff"))
        .send({
          name: "Novo Super",
          email: "novo@ficc.test",
          password: TEST_PASSWORD,
          roleIds: [superRole.id],
        })
        .expect(403);
      const secretariaRole = roles.find((role) => role.key === "SECRETARIA")!;
      await diretoria$
        .post(ctx.api("/admin/staff"))
        .send({
          name: "Nova Secretaria",
          email: "nova@ficc.test",
          password: TEST_PASSWORD,
          roleIds: [secretariaRole.id],
        })
        .expect(201);

      // Professor: the coach portal only.
      await coach$.get(ctx.api("/admin/freezes")).expect(403);

      // Super admin: platform (roles) — and the club never loses its last super admin.
      await admin$
        .post(ctx.api("/admin/staff/roles"))
        .send({ name: "Caixa", permissions: ["BOOKINGS_MANAGE"] })
        .expect(201);
      const adminUser = await ctx.prisma.user.findFirstOrThrow({
        where: { email: "admin@ficc.test" },
      });
      const last = await admin$
        .put(ctx.api(`/admin/staff/${adminUser.id}/roles`))
        .send({ roleIds: [secretariaRole.id] })
        .expect(409);
      expect(last.body.code).toBe("LAST_SUPER_ADMIN");

      await new Promise((resolve) => setTimeout(resolve, 100));
      const audit = (await diretoria$.get(ctx.api("/admin/audit")).expect(200)).body as {
        action: string;
        actor: { name: string } | null;
        details: Record<string, unknown> | null;
      }[];
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "PATCH /admin/settings",
            actor: expect.objectContaining({ name: "Diretoria" }),
          }),
          expect.objectContaining({
            action: "POST /news",
            actor: expect.objectContaining({ name: "Secretaria" }),
          }),
          expect.objectContaining({ action: "POST /admin/staff/roles" }),
        ]),
      );
      expect(audit.some((entry) => entry.action === "POST /news/:id/read")).toBe(false);
      const created = audit.find((entry) => entry.action === "POST /admin/staff");
      expect(created?.details?.password).toBe("***");
    });
  });

  describe("no-shows", () => {
    it("co-players and staff mark no-shows; the optional penalty suspends bookings", async () => {
      const [ana, bia, caio] = [
        await createMember(ctx.prisma, { membershipId: "9101" }),
        await createMember(ctx.prisma, { membershipId: "9102" }),
        await createMember(ctx.prisma, { membershipId: "9103" }),
      ];
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const bia$ = await ctx.loginMember(bia.membershipId!);
      await patchSettings({
        noShowPenalty: { enabled: true, count: 2, windowDays: 30, suspensionDays: 7 },
      });
      const book = async (time: string, date: string) => {
        const booking = await ana$
          .post(ctx.api("/bookings"))
          .send({
            courtId: club.courts.Q2.id,
            timeSlotId: club.slots[time]!.id,
            date,
            type: "SINGLES",
            playerIds: [bia.id],
          })
          .expect(201);
        await bia$.post(ctx.api(`/bookings/${booking.body.id}/confirm`)).expect(200);
        return booking.body.id as string;
      };
      const first = await book("14:45", "2030-03-04");
      const early = await ana$
        .post(ctx.api(`/bookings/${first}/no-shows`))
        .send({ userId: bia.id })
        .expect(422);
      expect(early.body.code).toBe("NO_SHOW_TOO_EARLY");
      ctx.clock.set("2030-03-04T18:00:00.000Z"); // 15:00, the slot started
      await ana$
        .post(ctx.api(`/bookings/${first}/no-shows`))
        .send({ userId: bia.id })
        .expect(201);
      expect(
        (
          await ana$
            .post(ctx.api(`/bookings/${first}/no-shows`))
            .send({ userId: bia.id })
            .expect(409)
        ).body.code,
      ).toBe("NO_SHOW_EXISTS");
      const caio$ = await ctx.loginMember(caio.membershipId!);
      expect(
        (
          await caio$
            .post(ctx.api(`/bookings/${first}/no-shows`))
            .send({ userId: bia.id })
            .expect(403)
        ).body.code,
      ).toBe("NO_SHOW_FORBIDDEN");

      // Bia cancels a confirmed booking 30 minutes before: a late cancellation (second strike).
      ctx.clock.set("2030-03-05T10:00:00.000Z");
      const second = await book("17:15", TUESDAY);
      ctx.clock.set("2030-03-05T19:45:00.000Z"); // 16:45, 30 min before 17:15
      await bia$.post(ctx.api(`/bookings/${second}/cancel`)).expect(200);

      const suspended = await ctx.prisma.user.findUniqueOrThrow({ where: { id: bia.id } });
      expect(suspended.bookingSuspendedUntil?.toISOString()).toBe("2030-03-12T19:45:00.000Z");
      const note = await ctx.prisma.notification.findFirst({
        where: { userId: bia.id, type: "BOOKING_SUSPENDED" },
      });
      expect(note?.payload).toMatchObject({ count: 2, windowDays: 30 });
      const refused = await bia$
        .post(ctx.api("/bookings"))
        .send({
          courtId: club.courts.Q3.id,
          timeSlotId: club.slots["21:00"]!.id,
          date: TUESDAY,
          type: "SINGLES",
          playerIds: [caio.id],
        })
        .expect(403);
      expect(refused.body.code).toBe("BOOKING_SUSPENDED");

      const history = await admin$.get(ctx.api(`/admin/members/${bia.id}/no-shows`)).expect(200);
      expect(history.body.items.map((item: { kind: string }) => item.kind)).toEqual([
        "LATE_CANCEL",
        "NO_SHOW",
      ]);
      expect(history.body.recent).toBe(2);
      const list = await admin$.get(ctx.api("/admin/members")).query({ q: "9102" }).expect(200);
      expect(list.body[0]).toMatchObject({ recentNoShows: 2, status: "ACTIVE" });
    });

    it("no penalty while the club keeps it off (the default)", async () => {
      await patchSettings({ noShowPenalty: DEFAULT_CLUB_SETTINGS.noShowPenalty });
      const [ana, bia] = [
        await createMember(ctx.prisma, { membershipId: "9201" }),
        await createMember(ctx.prisma, { membershipId: "9202" }),
      ];
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const booking = await ana$
        .post(ctx.api("/bookings"))
        .send({
          courtId: club.courts.Q2.id,
          timeSlotId: club.slots["10:00"]!.id,
          date: "2030-03-04",
          type: "SINGLES",
          playerIds: [bia.id],
        })
        .expect(201);
      ctx.clock.set("2030-03-04T13:30:00.000Z");
      for (const userId of [bia.id]) {
        await admin$
          .post(ctx.api(`/bookings/${booking.body.id}/no-shows`))
          .send({ userId })
          .expect(201);
      }
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: bia.id } });
      expect(user.bookingSuspendedUntil).toBeNull();
    });
  });

  describe("Mural", () => {
    it("posts notify members; members react and staff see read counts", async () => {
      await createStaff(ctx.prisma, Role.ADMIN, "secretaria@ficc.test", "Secretaria", [
        "SECRETARIA",
      ]);
      const members = [
        await createMember(ctx.prisma, { membershipId: "9301" }),
        await createMember(ctx.prisma, { membershipId: "9302" }),
      ];
      const secretaria$ = await ctx.loginStaff("secretaria@ficc.test");
      await secretaria$
        .post(ctx.api("/news"))
        .send({ title: "Quadras fechadas", body: "Chuva forte", notify: false })
        .expect(201);
      const pinned = await secretaria$
        .post(ctx.api("/news"))
        .send({
          title: "Festa de fim de ano",
          body: "Dia 20, no salão",
          eventDate: "2030-12-20",
          pinned: true,
        })
        .expect(201);
      for (const member of members) {
        const notes = await ctx.prisma.notification.findMany({ where: { userId: member.id } });
        expect(notes.map((note) => note.type)).toEqual(["NEWS_POSTED"]);
      }
      const member$ = await ctx.loginMember(members[0]!.membershipId!);
      const feed = await member$.get(ctx.api("/news")).expect(200);
      expect(feed.body.map((post: { title: string }) => post.title)).toEqual([
        "Festa de fim de ano",
        "Quadras fechadas",
      ]);
      expect(feed.body[0]).toMatchObject({
        readCount: null,
        reactions: 0,
        eventDate: "2030-12-20",
      });
      const reacted = await member$.post(ctx.api(`/news/${pinned.body.id}/react`)).expect(200);
      expect(reacted.body).toMatchObject({ reactions: 1, reactedByMe: true });
      await member$.post(ctx.api(`/news/${pinned.body.id}/read`)).expect(204);
      await member$.post(ctx.api("/news")).send({ title: "Oi pessoal", body: "x" }).expect(403);
      const staffFeed = await secretaria$.get(ctx.api("/news")).expect(200);
      expect(staffFeed.body[0]).toMatchObject({ readCount: 1, reactions: 1, reactedByMe: false });
      await secretaria$.delete(ctx.api(`/news/${pinned.body.id}`)).expect(204);
      expect((await member$.get(ctx.api("/news")).expect(200)).body).toHaveLength(1);
    });
  });
});
