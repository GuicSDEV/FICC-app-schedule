import type { AddressInfo } from "node:net";

import { MissingTenantError, tenantExtension } from "@ficc/db";
import { SOCKET_EVENTS } from "@ficc/shared";
import { io, type Socket } from "socket.io-client";

import { createTestApp, TEST_CLUB_HEADER, type TestContext } from "./support/app";
import {
  type Club,
  createMember,
  createStaff,
  resetDatabase,
  seedClub,
  TEST_PASSWORD,
} from "./support/fixtures";

// Fake clock: Monday 2030-03-04 09:00 club time.
const WEDNESDAY = "2030-03-06";

/**
 * Data isolation between clubs. Only FICC exists in v1; the second club is created here, inside
 * the test, and never seeded or shown in any UI.
 */
describe("Multi-club isolation", () => {
  let ctx: TestContext;
  let url: string;
  let ficc: Club;
  let other: Club;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp({ listen: true });
    const { port } = ctx.app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    ficc = await seedClub(ctx);
    other = await seedClub(ctx, { slug: "outro", name: "Outro Clube" });
  });

  /** Members of both clubs, with the same matrícula (unique per club, not globally). */
  async function seedPeople() {
    ctx.useClub(ficc.id);
    const ana = await createMember(ctx.prisma, { name: "Ana FICC", membershipId: "104218" });
    const bruno = await createMember(ctx.prisma, { name: "Bruno FICC", membershipId: "104377" });
    await createStaff(ctx.prisma, "ADMIN", "admin@clube.test", "Admin FICC");
    ctx.useClub(other.id);
    const otto = await createMember(ctx.prisma, { name: "Otto Outro", membershipId: "104218" });
    const olga = await createMember(ctx.prisma, { name: "Olga Outro", membershipId: "200002" });
    await createStaff(ctx.prisma, "ADMIN", "admin@clube.test", "Admin Outro");
    return { ana, bruno, otto, olga };
  }

  const otherClub = async (membershipId: string) => {
    const agent = await ctx.loginMember(membershipId, other.slug);
    return agent.set(TEST_CLUB_HEADER, other.slug);
  };

  it("logs the same matrícula and email into each club as a different person", async () => {
    const { ana, otto } = await seedPeople();
    const ficc$ = await ctx.loginMember("104218");
    const other$ = await otherClub("104218");

    expect((await ficc$.get(ctx.api("/auth/me")).expect(200)).body).toMatchObject({
      id: ana.id,
      clubId: ficc.id,
      name: "Ana FICC",
    });
    expect((await other$.get(ctx.api("/auth/me")).expect(200)).body).toMatchObject({
      id: otto.id,
      clubId: other.id,
      name: "Otto Outro",
    });
    expect((await other$.get(ctx.api("/club")).expect(200)).body).toMatchObject({
      slug: "outro",
      name: "Outro Clube",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      sports: ["TENNIS"],
      settings: { bookingWindowDays: 14, maxActiveBookings: 2, eloKFactor: 32 },
    });

    const staff = await ctx.loginStaff("admin@clube.test", other.slug);
    staff.set(TEST_CLUB_HEADER, other.slug);
    expect((await staff.get(ctx.api("/auth/me")).expect(200)).body.name).toBe("Admin Outro");
  });

  it("never shows or touches another club's courts, bookings, members or rankings", async () => {
    const { ana, bruno, olga } = await seedPeople();
    const ficc$ = await ctx.loginMember(ana.membershipId!);
    const booking = await ficc$
      .post(ctx.api("/bookings"))
      .send({
        courtId: ficc.courts.Q2.id,
        timeSlotId: ficc.slots["18:30"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(201);

    const other$ = await otherClub("200002");
    const schedule = await other$.get(ctx.api(`/schedule?date=${WEDNESDAY}`)).expect(200);
    const courtIds = new Set(schedule.body.courts.map((court: { id: string }) => court.id));
    expect(courtIds).toEqual(new Set(Object.values(other.courts).map((court) => court.id)));
    expect(schedule.body.cells.every((cell: { state: string }) => cell.state === "free")).toBe(
      true,
    );

    // FICC's booking, court and members are invisible from the other club.
    await other$.get(ctx.api(`/bookings/${booking.body.id}`)).expect(404);
    const foreignCourt = await other$
      .post(ctx.api("/bookings"))
      .send({
        courtId: ficc.courts.Q2.id,
        timeSlotId: ficc.slots["18:30"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [olga.id],
      })
      .expect(404);
    expect(foreignCourt.body.code).toBe("COURT_NOT_FOUND");
    const tagged = await other$
      .post(ctx.api("/bookings"))
      .send({
        courtId: other.courts.Q2.id,
        timeSlotId: other.slots["18:30"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(422);
    expect(tagged.body.code).toBe("INVALID_PLAYERS");
    const search = await other$.get(ctx.api("/members/search?q=FICC")).expect(200);
    expect(search.body).toEqual([]);
    const board = await other$.get(ctx.api("/leaderboard")).expect(200);
    expect(
      board.body.entries.map((entry: { player: { name: string } }) => entry.player.name),
    ).toEqual(["Olga Outro", "Otto Outro"]);
    await other$.get(ctx.api(`/players/${ana.id}`)).expect(404);

    // Writes made through the other club are stamped with its id.
    const own = await other$
      .post(ctx.api("/bookings"))
      .send({
        courtId: other.courts.Q2.id,
        timeSlotId: other.slots["18:30"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [(await ctx.base.user.findFirstOrThrow({ where: { name: "Otto Outro" } })).id],
      })
      .expect(201);
    const rows = await ctx.base.booking.findMany({ select: { id: true, clubId: true } });
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: booking.body.id, clubId: ficc.id },
        { id: own.body.id, clubId: other.id },
      ]),
    );
    const invite = await ctx.base.notification.findFirstOrThrow({
      where: { type: "BOOKING_INVITE", userId: { not: bruno.id } },
    });
    expect(invite.clubId).toBe(other.id);

    // Same court name and slot in both clubs: each club's grid is its own.
    const ficcSchedule = await ficc$.get(ctx.api(`/schedule?date=${WEDNESDAY}`)).expect(200);
    const q2 = (
      body: { cells: { courtId: string; timeSlotId: string; state: string }[] },
      club: Club,
    ) =>
      body.cells.find(
        (cell) => cell.courtId === club.courts.Q2.id && cell.timeSlotId === club.slots["18:30"]!.id,
      )?.state;
    expect(q2(ficcSchedule.body, ficc)).toBe("booking");
    const otherSchedule = await other$.get(ctx.api(`/schedule?date=${WEDNESDAY}`)).expect(200);
    expect(q2(otherSchedule.body, other)).toBe("booking");
  });

  it("applies each club's own rules from its settings", async () => {
    const { otto, olga } = await seedPeople();
    await ctx.base.clubSettings.update({
      where: { clubId: other.id },
      data: {
        values: { bookingWindowDays: 2, maxActiveBookings: 1, bookingConfirmationMinutes: 30 },
      },
    });
    ctx.invalidateClubs();
    const other$ = await otherClub("200002");
    const book = (date: string, slot: string) =>
      other$.post(ctx.api("/bookings")).send({
        courtId: other.courts.Q1.id,
        timeSlotId: other.slots[slot]!.id,
        date,
        type: "SINGLES",
        playerIds: [otto.id],
      });

    const tooFar = await book(WEDNESDAY, "18:30").expect(422);
    expect(tooFar.body).toMatchObject({
      code: "BEYOND_BOOKING_WINDOW",
      message: "Reservas abrem com até 2 dias de antecedência.",
    });
    const first = await book("2030-03-05", "18:30").expect(201);
    // 30 minutes to confirm instead of FICC's 2 hours.
    expect(new Date(first.body.expiresAt).getTime() - ctx.clock.now().getTime()).toBe(30 * 60_000);
    const limit = await book("2030-03-05", "19:45").expect(422);
    expect(limit.body.message).toContain(`${olga.name} já tem 1 reservas ativas`);

    // FICC keeps its own rules.
    const ficc$ = await ctx.loginMember("104377");
    const ana = await ctx.base.user.findFirstOrThrow({ where: { name: "Ana FICC" } });
    await ficc$
      .post(ctx.api("/bookings"))
      .send({
        courtId: ficc.courts.Q1.id,
        timeSlotId: ficc.slots["18:30"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [ana.id],
      })
      .expect(201);
  });

  it("rejects a session token from another club", async () => {
    await seedPeople();
    const ficc$ = await ctx.loginMember("104218");
    await ficc$.get(ctx.api("/auth/me")).expect(200);
    await ficc$.get(ctx.api("/auth/me")).set(TEST_CLUB_HEADER, other.slug).expect(401);
    await ficc$.get(ctx.api("/bookings/mine")).set(TEST_CLUB_HEADER, other.slug).expect(401);
  });

  it("keeps real-time events inside the club", async () => {
    const { ana, bruno } = await seedPeople();
    const connect = async (membershipId: string, slug?: string) => {
      const login = await ctx
        .http()
        .post(ctx.api("/auth/login"))
        .set(TEST_CLUB_HEADER, slug ?? ficc.slug)
        .send({ kind: "member", membershipId, password: TEST_PASSWORD })
        .expect(200);
      const cookie = (login.headers["set-cookie"] as unknown as string[])
        .map((entry) => entry.split(";")[0])
        .join("; ");
      const socket = io(url, {
        transports: ["websocket"],
        extraHeaders: { cookie, ...(slug ? { [TEST_CLUB_HEADER]: slug } : {}) },
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
      });
      return socket;
    };
    const ficcWatcher = await connect(bruno.membershipId!);
    const otherWatcher = await connect("200002", other.slug);
    const otherEvents: unknown[] = [];
    otherWatcher.on(SOCKET_EVENTS.scheduleUpdated, (event: unknown) => otherEvents.push(event));
    const ficcEvent = new Promise((resolve) =>
      ficcWatcher.once(SOCKET_EVENTS.scheduleUpdated, resolve),
    );

    const ficc$ = await ctx.loginMember(ana.membershipId!);
    await ficc$
      .post(ctx.api("/bookings"))
      .send({
        courtId: ficc.courts.Q3.id,
        timeSlotId: ficc.slots["19:45"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(201);
    await ficcEvent;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(otherEvents).toEqual([]);
  });

  it("refuses to query club-owned data with no club in context", async () => {
    const unscoped = ctx.base.$extends(tenantExtension(() => undefined));
    await expect(unscoped.court.findMany()).rejects.toBeInstanceOf(MissingTenantError);
    // A write that escapes the extension gets no club and fails the NOT NULL constraint.
    await expect(
      ctx.base.timeSlot.create({ data: { startTime: "07:00", durationMinutes: 60, sortOrder: 0 } }),
    ).rejects.toThrow(/clubId/);
  });
});
