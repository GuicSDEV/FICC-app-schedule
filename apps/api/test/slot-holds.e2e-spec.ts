import { Role } from "@ficc/db";
import type { ScheduleDay, SlotHoldView } from "@ficc/shared";
import type TestAgent from "supertest/lib/agent";

import { createTestApp, type TestContext } from "./support/app";
import { type Club, createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo (the fake clock's default). */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";
const TUESDAY = "2030-03-05";

describe("Keeping a court while booking it (slot holds)", () => {
  let ctx: TestContext;
  let club: Club;
  let ana$: TestAgent;
  let bia$: TestAgent;
  let caio$: TestAgent;
  let ids: { ana: string; bia: string; caio: string; dani: string };

  const slot = () => ({
    courtId: club.courts.Q1.id,
    timeSlotId: club.slots["18:30"]!.id,
    date: TUESDAY,
  });
  const claim = (agent: TestAgent, body = slot()) => agent.post(ctx.api("/slot-holds")).send(body);
  const book = (agent: TestAgent, partnerId: string, body = slot()) =>
    agent.post(ctx.api("/bookings")).send({ ...body, type: "SINGLES", playerIds: [partnerId] });

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
    const [ana, bia, caio, dani] = [
      await createMember(ctx.prisma, { membershipId: "7001" }),
      await createMember(ctx.prisma, { membershipId: "7002" }),
      await createMember(ctx.prisma, { membershipId: "7003" }),
      await createMember(ctx.prisma, { membershipId: "7004" }),
    ];
    ids = { ana: ana.id, bia: bia.id, caio: caio.id, dani: dani.id };
    ana$ = await ctx.loginMember("7001");
    bia$ = await ctx.loginMember("7002");
    caio$ = await ctx.loginMember("7003");
  });

  it("the first tap keeps the court; the next ones wait in line and cannot book it", async () => {
    const first = (await claim(ana$).expect(201)).body as SlotHoldView;
    expect(first).toMatchObject({ status: "HOLDING", position: null });
    expect(Date.parse(first.expiresAt!) - Date.parse(MONDAY_9AM)).toBe(120_000);

    const second = (await claim(bia$).expect(201)).body as SlotHoldView;
    expect(second).toMatchObject({ status: "WAITING", position: 1 });
    expect(second.holderExpiresAt).toBe(first.expiresAt);
    // Free courts to pick instead, never the one being booked.
    expect(second.alternatives.length).toBeGreaterThan(0);
    expect(
      second.alternatives.some(
        (option) => option.courtId === slot().courtId && option.timeSlotId === slot().timeSlotId,
      ),
    ).toBe(false);
    const third = (await claim(caio$).expect(201)).body as SlotHoldView;
    expect(third).toMatchObject({ status: "WAITING", position: 2 });

    const blocked = await book(bia$, ids.dani).expect(409);
    expect(blocked.body.code).toBe("SLOT_HELD");

    // Every calendar shows the court as being booked.
    const day = (await caio$.get(ctx.api(`/schedule?date=${TUESDAY}`)).expect(200))
      .body as ScheduleDay;
    const cell = day.cells.find(
      (entry) => entry.courtId === slot().courtId && entry.timeSlotId === slot().timeSlotId,
    );
    expect(cell).toMatchObject({
      state: "free",
      hold: { userId: ids.ana, until: first.expiresAt },
    });

    // The holder books it: the line is cleared.
    await book(ana$, ids.dani).expect(201);
    expect((await bia$.get(ctx.api("/slot-holds/mine")).expect(200)).body).toEqual({});
    const lost = await claim(bia$).expect(409);
    expect(lost.body.code).toBe("SLOT_TAKEN");
  });

  it("when the holder gives up or runs out of time, the next in line gets the court", async () => {
    await claim(ana$).expect(201);
    await claim(bia$).expect(201);
    await claim(caio$).expect(201);

    // Ana closes the sheet: Bia's turn, with a fresh full hold.
    await ana$.delete(ctx.api("/slot-holds")).expect(204);
    ctx.clock.advance(10_000);
    const bia = (await bia$.get(ctx.api("/slot-holds/mine")).expect(200)).body as SlotHoldView;
    expect(bia.status).toBe("HOLDING");

    // Bia lets the time run out while Caio keeps his place: Caio gets it.
    ctx.clock.advance(30_000);
    expect(
      ((await caio$.get(ctx.api("/slot-holds/mine")).expect(200)).body as SlotHoldView).position,
    ).toBe(1);
    // His waiting screen checks in every few seconds until Bia's time is over.
    for (const step of [30_000, 30_000]) {
      ctx.clock.advance(step);
      await caio$.get(ctx.api("/slot-holds/mine")).expect(200);
    }
    ctx.clock.advance(30_000);
    const caio = (await caio$.get(ctx.api("/slot-holds/mine")).expect(200)).body as SlotHoldView;
    expect(caio.status).toBe("HOLDING");
    const late = await book(bia$, ids.dani).expect(409);
    expect(late.body.code).toBe("SLOT_HELD");
    await book(caio$, ids.dani).expect(201);
  });

  it("one court at a time, and members who stop waiting lose their place", async () => {
    await claim(ana$).expect(201);
    // Ana taps another court: the first one is free again.
    const other = { ...slot(), courtId: club.courts.Q2.id };
    expect(((await claim(ana$, other).expect(201)).body as SlotHoldView).status).toBe("HOLDING");
    expect(((await claim(bia$).expect(201)).body as SlotHoldView).status).toBe("HOLDING");

    // Caio waits but his screen goes silent: Ana, who keeps checking in, is first in line.
    await claim(caio$).expect(201);
    ctx.clock.advance(20_000);
    await claim(ana$).expect(201);
    ctx.clock.advance(30_000);
    const ana = (await ana$.get(ctx.api("/slot-holds/mine")).expect(200)).body as SlotHoldView;
    expect(ana).toMatchObject({ status: "WAITING", position: 1 });
    expect((await caio$.get(ctx.api("/slot-holds/mine")).expect(200)).body).toEqual({});
  });

  it("only courts the member could book can be kept", async () => {
    // Already booked by Ana: Bia cannot keep it.
    await book(ana$, ids.dani).expect(201);
    expect((await claim(bia$).expect(409)).body.code).toBe("SLOT_TAKEN");
    // Ana already plays that day (one booking per day): she cannot keep another court.
    const sameDay = { ...slot(), courtId: club.courts.Q3.id, timeSlotId: club.slots["21:00"]!.id };
    expect((await claim(ana$, sameDay).expect(422)).body.code).toBe("MAX_BOOKINGS_PER_DAY");
    // Past slots are refused.
    const past = { ...slot(), date: "2030-03-04", timeSlotId: club.slots["08:30"]!.id };
    expect((await claim(bia$, past).expect(422)).body.code).toBe("SLOT_IN_PAST");
    // Staff do not book courts.
    const admin$ = await ctx.loginStaff("admin@ficc.test");
    await admin$.post(ctx.api("/slot-holds")).send(slot()).expect(403);
  });

  it("two members tapping the same court in the same instant: exactly one keeps it", async () => {
    const members = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createMember(ctx.prisma, { membershipId: String(7100 + index) }),
      ),
    );
    const agents = await Promise.all(
      members.map((member) => ctx.loginMember(member.membershipId!)),
    );
    const answers = await Promise.all(agents.map((agent) => claim(agent)));
    expect(answers.every((answer) => answer.status === 201)).toBe(true);
    const views = answers.map((answer) => answer.body as SlotHoldView);
    expect(views.filter((view) => view.status === "HOLDING")).toHaveLength(1);
    const positions = views
      .filter((view) => view.status === "WAITING")
      .map((view) => view.position)
      .sort((a, b) => a! - b!);
    expect(positions).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
  });
});
