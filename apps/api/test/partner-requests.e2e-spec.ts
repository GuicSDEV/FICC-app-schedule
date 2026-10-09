import { Role } from "@ficc/db";
import type { PartnerRequestItem } from "@ficc/shared";
import type TestAgent from "supertest/lib/agent";

import { createTestApp, type TestContext } from "./support/app";
import { type Club, createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo (the fake clock's default). */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";
const TUESDAY = "2030-03-05";

describe("Looking for a partner (partner requests)", () => {
  let ctx: TestContext;
  let club: Club;
  let ana$: TestAgent;
  let bia$: TestAgent;
  let ids: { ana: string; bia: string; caio: string };

  const at = (time: string, date = TUESDAY) => ({ date, timeSlotId: club.slots[time]!.id });
  const post = (agent: TestAgent, body: object) =>
    agent.post(ctx.api("/partner-requests")).send(body);
  const list = async (agent: TestAgent, date = TUESDAY) =>
    (await agent.get(ctx.api(`/partner-requests?date=${date}`)).expect(200))
      .body as PartnerRequestItem[];

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
    const ana = await createMember(ctx.prisma, { membershipId: "8001", name: "Ana Lima" });
    const bia = await createMember(ctx.prisma, { membershipId: "8002", name: "Bia Reis" });
    const caio = await createMember(ctx.prisma, { membershipId: "8003", name: "Caio Dias" });
    ids = { ana: ana.id, bia: bia.id, caio: caio.id };
    ana$ = await ctx.loginMember("8001");
    bia$ = await ctx.loginMember("8002");
  });

  it("a member posts, others see it and booking with them closes it", async () => {
    const created = (
      await post(ana$, {
        ...at("18:30"),
        type: "SINGLES",
        note: "  Jogo de nível intermediário ",
      }).expect(201)
    ).body as PartnerRequestItem;
    expect(created).toMatchObject({
      player: { id: ids.ana, name: "Ana Lima" },
      date: TUESDAY,
      startTime: "18:30",
      type: "SINGLES",
      note: "Jogo de nível intermediário",
      mine: true,
    });

    const seen = await list(bia$);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: created.id, mine: false });
    expect(await list(bia$, "2030-03-06")).toEqual([]);

    // Bia books a court at that time with Ana: Ana gets the invitation and the request closes.
    await bia$
      .post(ctx.api("/bookings"))
      .send({
        courtId: club.courts.Q2.id,
        ...at("18:30"),
        type: "SINGLES",
        playerIds: [ids.ana],
      })
      .expect(201);
    expect(await list(bia$)).toEqual([]);
    const row = await ctx.prisma.partnerRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("MATCHED");
    expect(row.bookingId).not.toBeNull();
    expect(
      await ctx.prisma.notification.count({ where: { userId: ids.ana, type: "BOOKING_INVITE" } }),
    ).toBe(1);
  });

  it("a member withdraws their request; nobody else can", async () => {
    const created = (await post(ana$, { ...at("18:30"), type: "DOUBLES" }).expect(201))
      .body as PartnerRequestItem;
    await bia$.delete(ctx.api(`/partner-requests/${created.id}`)).expect(404);
    await ana$.delete(ctx.api(`/partner-requests/${created.id}`)).expect(204);
    expect(await list(bia$)).toEqual([]);
    await ana$.delete(ctx.api(`/partner-requests/${created.id}`)).expect(404);
    // Withdrawn: the same time can be posted again.
    await post(ana$, { ...at("18:30"), type: "SINGLES" }).expect(201);
  });

  it("enforces the rules: one per time, the club's maximum, bookable times only", async () => {
    await post(ana$, { ...at("18:30"), type: "SINGLES" }).expect(201);
    expect((await post(ana$, { ...at("18:30"), type: "DOUBLES" }).expect(409)).body.code).toBe(
      "PARTNER_REQUEST_EXISTS",
    );
    await post(ana$, { ...at("10:00"), type: "SINGLES" }).expect(201);
    await post(ana$, { ...at("21:00"), type: "SINGLES" }).expect(201);
    // partnerRequestMaxOpen defaults to 3.
    expect((await post(ana$, { ...at("08:30"), type: "SINGLES" }).expect(422)).body.code).toBe(
      "PARTNER_REQUEST_LIMIT",
    );

    // Past times, times beyond the booking window and notes that are too long are refused.
    expect(
      (await post(bia$, { ...at("08:30", "2030-03-04"), type: "SINGLES" }).expect(422)).body.code,
    ).toBe("SLOT_IN_PAST");
    expect(
      (await post(bia$, { ...at("18:30", "2030-04-30"), type: "SINGLES" }).expect(422)).body.code,
    ).toBe("BEYOND_BOOKING_WINDOW");
    await post(bia$, { ...at("18:30"), type: "SINGLES", note: "x".repeat(141) }).expect(400);

    // Already playing at that time: no request.
    await bia$
      .post(ctx.api("/bookings"))
      .send({ courtId: club.courts.Q1.id, ...at("10:00"), type: "SINGLES", playerIds: [ids.caio] })
      .expect(201);
    expect((await post(bia$, { ...at("10:00"), type: "SINGLES" }).expect(409)).body.code).toBe(
      "PLAYER_BUSY",
    );

    // Staff do not post.
    const admin$ = await ctx.loginStaff("admin@ficc.test");
    await post(admin$, { ...at("18:30"), type: "SINGLES" }).expect(403);
  });

  it("drops out of the list once its time starts, and frees a court the member was keeping", async () => {
    // Ana taps a court (keeps it), then posts instead: the court is free again.
    await ana$
      .post(ctx.api("/slot-holds"))
      .send({ courtId: club.courts.Q1.id, ...at("18:30") })
      .expect(201);
    await post(ana$, { ...at("18:30"), type: "SINGLES" }).expect(201);
    expect((await ana$.get(ctx.api("/slot-holds/mine")).expect(200)).body).toEqual({});

    expect(await list(bia$)).toHaveLength(1);
    // Tuesday 18:30 in São Paulo is 21:30 UTC.
    ctx.clock.set("2030-03-05T21:30:00.000Z");
    expect(await list(bia$)).toEqual([]);
  });
});
