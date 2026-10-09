import { Role, type User } from "@ficc/db";

import { LessonsService } from "../src/lessons/lessons.service";
import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createCoach,
  createLesson,
  createMember,
  createStaff,
  resetDatabase,
  seedClub,
} from "./support/fixtures";

// Fake clock: Monday 2030-03-04 09:00 club time.
const WED = "2030-03-06";

describe("Coach portal and lessons", () => {
  let ctx: TestContext;
  let club: Club;
  let alan: Awaited<ReturnType<typeof createCoach>>;
  let phelipe: Awaited<ReturnType<typeof createCoach>>;
  let ana: User;
  let bruno: User;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    await resetDatabase(ctx.prisma);
    club = await seedClub(ctx.prisma);
    alan = await createCoach(ctx.prisma, {
      name: "Alan",
      email: "alan@ficc.test",
      courtIds: [club.courts.Q5.id],
    });
    phelipe = await createCoach(ctx.prisma, {
      name: "Phelipe",
      email: "phelipe@ficc.test",
      courtIds: [club.courts.Q6.id, club.courts.Q5.id],
    });
    ana = await createMember(ctx.prisma, { name: "Ana Lima" });
    bruno = await createMember(ctx.prisma, { name: "Bruno Reis" });
  });

  const lessonBody = (overrides: Record<string, unknown> = {}) => ({
    courtId: club.courts.Q5.id,
    timeSlotId: club.slots["18:30"]!.id,
    date: WED,
    ...overrides,
  });

  it("creates a one-off lesson on an allowed court, visible on the member calendar, and logs it", async () => {
    const coach = await ctx.loginStaff("alan@ficc.test");
    const created = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ studentNames: "Marina" }))
      .expect(201);
    expect(created.body).toMatchObject({
      lesson: {
        date: WED,
        court: { name: "Q5" },
        slot: { startTime: "18:30" },
        coach: { displayName: "Alan" },
        studentNames: "Marina",
      },
      series: null,
    });

    const member = await ctx.loginMember(ana.membershipId!);
    const { body } = await member.get(`/api/schedule?date=${WED}`).expect(200);
    const cell = body.cells.find(
      (entry: { courtId: string; timeSlotId: string }) =>
        entry.courtId === club.courts.Q5.id && entry.timeSlotId === club.slots["18:30"]!.id,
    );
    expect(cell).toMatchObject({
      state: "lesson",
      lesson: { coach: { displayName: "Alan" }, studentNames: null },
    });

    const audit = await ctx.prisma.lessonAuditLog.findFirstOrThrow();
    expect(audit).toMatchObject({
      action: "CREATED",
      actorId: alan.user.id,
      lessonId: created.body.lesson.id,
    });
  });

  it("blocks a coach from courts they are not allowed on", async () => {
    const coach = await ctx.loginStaff("alan@ficc.test");
    const response = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ courtId: club.courts.Q6.id }))
      .expect(403);
    expect(response.body.code).toBe("COURT_NOT_ALLOWED");
  });

  it("blocks a coach from a slot booked by members", async () => {
    const member = await ctx.loginMember(ana.membershipId!);
    await member
      .post("/api/bookings")
      .send({ ...lessonBody(), type: "SINGLES", playerIds: [bruno.id] })
      .expect(201);
    const coach = await ctx.loginStaff("alan@ficc.test");
    const response = await coach.post("/api/coach/lessons").send(lessonBody()).expect(409);
    expect(response.body.code).toBe("SLOT_TAKEN");
  });

  it("blocks a coach from another coach's lesson slot and from changing it", async () => {
    const alan$ = await ctx.loginStaff("alan@ficc.test");
    const phelipe$ = await ctx.loginStaff("phelipe@ficc.test");
    const created = await alan$.post("/api/coach/lessons").send(lessonBody()).expect(201);

    const taken = await phelipe$.post("/api/coach/lessons").send(lessonBody()).expect(409);
    expect(taken.body.code).toBe("SLOT_HAS_LESSON");

    const id = created.body.lesson.id;
    for (const send of [
      () => phelipe$.post(`/api/coach/lessons/${id}/cancel`).send({ scope: "THIS" }),
      () => phelipe$.patch(`/api/coach/lessons/${id}`).send({ note: "minha" }),
      () => phelipe$.post(`/api/coach/lessons/${id}/restore`),
    ]) {
      const response = await send().expect(403);
      expect(response.body.code).toBe("NOT_YOUR_LESSON");
    }
  });

  it("does not let a coach teach two lessons at the same time", async () => {
    const phelipe$ = await ctx.loginStaff("phelipe@ficc.test");
    await phelipe$
      .post("/api/coach/lessons")
      .send(lessonBody({ courtId: club.courts.Q6.id }))
      .expect(201);
    const response = await phelipe$.post("/api/coach/lessons").send(lessonBody()).expect(409);
    expect(response.body.code).toBe("COACH_BUSY");
  });

  it("releases the slot on cancel so a member can book it right away, and tells watchers", async () => {
    await ctx.prisma.slotFavorite.create({
      data: { userId: bruno.id, courtId: club.courts.Q5.id, timeSlotId: club.slots["18:30"]!.id },
    });
    const coach = await ctx.loginStaff("alan@ficc.test");
    const created = await coach.post("/api/coach/lessons").send(lessonBody()).expect(201);
    const member = await ctx.loginMember(ana.membershipId!);
    await member
      .post("/api/bookings")
      .send({ ...lessonBody(), type: "SINGLES", playerIds: [bruno.id] })
      .expect(409);

    const cancelled = await coach
      .post(`/api/coach/lessons/${created.body.lesson.id}/cancel`)
      .send({ scope: "THIS" })
      .expect(200);
    expect(cancelled.body).toMatchObject({ cancelled: 1, lessons: [{ status: "CANCELLED" }] });
    expect(
      await ctx.prisma.notification.findFirst({ where: { userId: bruno.id, type: "SLOT_OPENED" } }),
    ).not.toBeNull();

    await member
      .post("/api/bookings")
      .send({ ...lessonBody(), type: "SINGLES", playerIds: [bruno.id] })
      .expect(201);
    // Undo is no longer possible: members took the slot.
    const restore = await coach
      .post(`/api/coach/lessons/${created.body.lesson.id}/restore`)
      .expect(409);
    expect(restore.body.code).toBe("SLOT_TAKEN");
  });

  it("restores a cancelled lesson while its slot is still free", async () => {
    const coach = await ctx.loginStaff("alan@ficc.test");
    const created = await coach.post("/api/coach/lessons").send(lessonBody()).expect(201);
    const id = created.body.lesson.id;
    await coach.post(`/api/coach/lessons/${id}/cancel`).send({ scope: "THIS" }).expect(200);
    const restored = await coach.post(`/api/coach/lessons/${id}/restore`).expect(200);
    expect(restored.body.status).toBe("SCHEDULED");
    expect(await ctx.prisma.slotOccupancy.count({ where: { lessonId: id } })).toBe(1);
    expect(
      (await ctx.prisma.lessonAuditLog.findMany({ orderBy: { createdAt: "asc" } })).map(
        (entry) => entry.action,
      ),
    ).toEqual(["CREATED", "CANCELLED", "RESTORED"]);
  });

  it("creates a weekly series for the 8-week window, skipping dates already booked", async () => {
    const member = await ctx.loginMember(ana.membershipId!);
    // Members hold Q5 18:30 on the second Wednesday.
    await member
      .post("/api/bookings")
      .send({ ...lessonBody({ date: "2030-03-13" }), type: "SINGLES", playerIds: [bruno.id] })
      .expect(201);

    const coach = await ctx.loginStaff("alan@ficc.test");
    const created = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ repeat: { weekdays: ["MON", "WED"] } }))
      .expect(201);

    // The window ends Sunday 2030-04-28 (56 days from Monday 2030-03-04): 8 Wednesdays
    // (03-06…04-24) + 7 Mondays (03-11…04-22), minus the booked 03-13.
    expect(created.body.series.skippedDates).toEqual(["2030-03-13"]);
    expect(created.body.series.generated).toBe(14);
    const series = await ctx.prisma.lessonSeries.findFirstOrThrow();
    expect(series.generatedUntil?.toISOString().slice(0, 10)).toBe("2030-04-28");
  });

  it("ends a series with 'this and all future' and never regenerates those dates", async () => {
    const coach = await ctx.loginStaff("alan@ficc.test");
    const created = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ repeat: { weekdays: ["WED"] } }))
      .expect(201);
    const third = await ctx.prisma.lesson.findFirstOrThrow({
      where: { date: new Date("2030-03-20T00:00:00Z") },
    });

    const response = await coach
      .post(`/api/coach/lessons/${third.id}/cancel`)
      .send({ scope: "THIS_AND_FUTURE" })
      .expect(200);
    expect(response.body.cancelled).toBe(6); // 03-20 … 04-24
    const series = await ctx.prisma.lessonSeries.findUniqueOrThrow({
      where: { id: created.body.series.id },
    });
    expect(series.endDate?.toISOString().slice(0, 10)).toBe("2030-03-19");
    expect(await ctx.prisma.lesson.count({ where: { status: "SCHEDULED" } })).toBe(2);

    // Weeks later the generator does not bring them back.
    ctx.clock.set("2030-04-15T12:00:00Z");
    expect((await ctx.app.get(LessonsService).generateSeriesOccurrences()).created).toBe(0);
    expect(await ctx.prisma.lesson.count({ where: { status: "SCHEDULED" } })).toBe(2);
    expect(
      (await ctx.prisma.lessonAuditLog.findFirstOrThrow({ where: { action: "SERIES_ENDED" } }))
        .details,
    ).toMatchObject({ cancelled: 6 });
  });

  it("moves a lesson to another slot, freeing the old one and refusing taken targets", async () => {
    const coach = await ctx.loginStaff("phelipe@ficc.test");
    const created = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ courtId: club.courts.Q6.id }))
      .expect(201);
    const other = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ courtId: club.courts.Q6.id, timeSlotId: club.slots["21:00"]!.id }))
      .expect(201);

    const moved = await coach
      .patch(`/api/coach/lessons/${created.body.lesson.id}`)
      .send({ courtId: club.courts.Q5.id, timeSlotId: club.slots["19:45"]!.id })
      .expect(200);
    expect(moved.body).toMatchObject({ court: { name: "Q5" }, slot: { startTime: "19:45" } });
    expect(
      await ctx.prisma.slotOccupancy.findMany({ where: { lessonId: created.body.lesson.id } }),
    ).toEqual([
      expect.objectContaining({ courtId: club.courts.Q5.id, timeSlotId: club.slots["19:45"]!.id }),
    ]);

    const clash = await coach
      .patch(`/api/coach/lessons/${created.body.lesson.id}`)
      .send({ courtId: club.courts.Q6.id, timeSlotId: club.slots["21:00"]!.id })
      .expect(409);
    expect(clash.body.code).toBe("SLOT_HAS_LESSON");
    // The failed move left the lesson where it was.
    expect(
      await ctx.prisma.slotOccupancy.count({ where: { lessonId: created.body.lesson.id } }),
    ).toBe(1);
    expect(other.body.lesson.id).toBeDefined();
    expect(
      (await ctx.prisma.lessonAuditLog.findFirstOrThrow({ where: { action: "UPDATED" } })).details,
    ).toMatchObject({
      before: { courtId: club.courts.Q6.id },
      after: { courtId: club.courts.Q5.id },
    });
  });

  it("copies this week's one-off lessons to next week, skipping taken slots", async () => {
    const coach = await ctx.loginStaff("alan@ficc.test");
    await coach.post("/api/coach/lessons").send(lessonBody()).expect(201);
    await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ timeSlotId: club.slots["21:00"]!.id, date: "2030-03-07" }))
      .expect(201);
    const member = await ctx.loginMember(ana.membershipId!);
    await member
      .post("/api/bookings")
      .send({
        ...lessonBody({ timeSlotId: club.slots["21:00"]!.id, date: "2030-03-14" }),
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(201);

    const copied = await coach
      .post("/api/coach/lessons/copy-week")
      .send({ weekStart: "2030-03-04" })
      .expect(200);
    expect(copied.body.created.map((lesson: { date: string }) => lesson.date)).toEqual([
      "2030-03-13",
    ]);
    expect(copied.body.skipped).toEqual([
      { date: "2030-03-14", courtName: "Q5", startTime: "21:00", reason: "reservado por sócios" },
    ]);
  });

  it("lets admins manage any coach's lessons and read the audit log", async () => {
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Diretoria");
    const admin = await ctx.loginStaff("admin@ficc.test");
    const missingCoach = await admin.post("/api/admin/lessons").send(lessonBody()).expect(422);
    expect(missingCoach.body.code).toBe("COACH_REQUIRED");

    const created = await admin
      .post("/api/admin/lessons")
      .send(lessonBody({ coachId: alan.coach.id }))
      .expect(201);
    const reassigned = await admin
      .patch(`/api/admin/lessons/${created.body.lesson.id}`)
      .send({ coachId: phelipe.coach.id })
      .expect(200);
    expect(reassigned.body.coach.displayName).toBe("Phelipe");
    await admin
      .post(`/api/admin/lessons/${created.body.lesson.id}/cancel`)
      .send({ scope: "THIS" })
      .expect(200);
    // The coach hears an admin cancelled their lesson.
    expect(
      await ctx.prisma.notification.findFirst({
        where: { userId: phelipe.user.id, type: "LESSON_CANCELLED" },
      }),
    ).not.toBeNull();

    const audit = await admin.get("/api/admin/lessons/audit").expect(200);
    expect(audit.body.map((entry: { action: string }) => entry.action)).toEqual([
      "CANCELLED",
      "UPDATED",
      "CREATED",
    ]);
    expect(audit.body[0].actor.name).toBe("Diretoria");

    // Coaches cannot reassign.
    const coach = await ctx.loginStaff("alan@ficc.test");
    const own = await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ date: "2030-03-07" }))
      .expect(201);
    await coach
      .patch(`/api/coach/lessons/${own.body.lesson.id}`)
      .send({ coachId: phelipe.coach.id })
      .expect(403);
  });

  it("serves the coach agenda for allowed courts with their own lesson details", async () => {
    const coach = await ctx.loginStaff("alan@ficc.test");
    await coach
      .post("/api/coach/lessons")
      .send(lessonBody({ studentNames: "Turma juvenil" }))
      .expect(201);
    const { body } = await coach.get(`/api/coach/agenda?date=${WED}`).expect(200);
    expect(body.courts.map((court: { name: string }) => court.name)).toEqual(["Q5"]);
    expect(
      body.cells.find((cell: { state: string }) => cell.state === "lesson").lesson.studentNames,
    ).toBe("Turma juvenil");
    const list = await coach.get("/api/coach/lessons?from=2030-03-04&to=2030-03-10").expect(200);
    expect(list.body).toHaveLength(1);
  });

  it("shows members a coach profile with courts and the week's upcoming lessons", async () => {
    // Today 08:30 already started (09:00 now): it counts for the week but is not upcoming.
    for (const [date, time] of [
      ["2030-03-04", "08:30"],
      [WED, "18:30"],
      ["2030-03-10", "10:00"],
      ["2030-03-11", "10:00"],
    ] as const) {
      await createLesson(ctx.prisma, {
        coachId: phelipe.coach.id,
        courtId: club.courts.Q6.id,
        timeSlotId: club.slots[time]!.id,
        date,
      });
    }
    const member = await ctx.loginMember(ana.membershipId!);
    const { body } = await member.get(`/api/coaches/${phelipe.coach.id}`).expect(200);
    expect(body).toMatchObject({
      coach: { id: phelipe.coach.id, displayName: "Phelipe" },
      courts: [{ name: "Q5" }, { name: "Q6" }],
      lessonsThisWeek: 3,
      upcoming: [
        { date: WED, court: { name: "Q6" }, slot: { startTime: "18:30" } },
        { date: "2030-03-10", slot: { startTime: "10:00" } },
      ],
    });

    await ctx.prisma.coach.update({ where: { id: alan.coach.id }, data: { isActive: false } });
    await member.get(`/api/coaches/${alan.coach.id}`).expect(404);
  });

  describe("series generation job", () => {
    it("keeps 8 weeks of occurrences generated and is idempotent", async () => {
      const series = await ctx.prisma.lessonSeries.create({
        data: {
          coachId: alan.coach.id,
          courtId: club.courts.Q5.id,
          timeSlotId: club.slots["08:30"]!.id,
          weekdays: ["MON", "TUE", "WED", "THU", "FRI"],
          startDate: new Date("2030-03-04T00:00:00Z"),
        },
      });
      const lessons = ctx.app.get(LessonsService);
      // Today 08:30 is already past at 09:00, so Monday is skipped: 40 weekdays − 1.
      expect(await lessons.generateSeriesOccurrences()).toEqual({ created: 39, skipped: 1 });
      expect(await lessons.generateSeriesOccurrences()).toEqual({ created: 0, skipped: 0 });

      ctx.clock.advance(7 * 86_400_000);
      expect((await lessons.generateSeriesOccurrences()).created).toBe(5);
      const updated = await ctx.prisma.lessonSeries.findUniqueOrThrow({ where: { id: series.id } });
      expect(updated.generatedUntil?.toISOString().slice(0, 10)).toBe("2030-05-05");
      expect(await ctx.prisma.slotOccupancy.count()).toBe(44);
    });
  });
});
