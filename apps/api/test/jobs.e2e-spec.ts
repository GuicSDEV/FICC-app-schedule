import { getQueueToken } from "@nestjs/bullmq";
import { type Queue, QueueEvents } from "bullmq";

import { CLUB_JOBS, CLUB_JOBS_QUEUE } from "../src/jobs/club-jobs";
import type * as RunnerModule from "../src/jobs/club-jobs.runner";
import type { ClubJobsRunner as Runner } from "../src/jobs/club-jobs.runner";
import type * as AppSupport from "./support/app";
import type { TestContext } from "./support/app";
import { type Club, createMember, resetDatabase, seedClub } from "./support/fixtures";

// Fake clock: Monday 2030-03-04 09:00 club time.
const WEDNESDAY = "2030-03-06";

/**
 * Background jobs run on BullMQ + Redis, once per club, inside each club's tenant context. This
 * file boots the jobs module (off in the other e2e files) on a queue prefix of its own.
 */
describe("Background jobs (BullMQ)", () => {
  let ctx: TestContext;
  let runner: Runner;
  let queue: Queue;
  let events: QueueEvents;
  let ficc: Club;
  let other: Club;
  const saved = { jobs: process.env.JOBS_ENABLED, prefix: process.env.QUEUE_PREFIX };

  beforeAll(async () => {
    process.env.JOBS_ENABLED = "true";
    process.env.QUEUE_PREFIX = `ficc-e2e-${process.pid}`;
    // AppModule decides whether to load the jobs module when it is imported, so import it only
    // after the environment above is set.
    const { createTestApp } = jest.requireActual<typeof AppSupport>("./support/app");
    const { ClubJobsRunner } = jest.requireActual<typeof RunnerModule>(
      "../src/jobs/club-jobs.runner",
    );
    ctx = await createTestApp();
    runner = ctx.app.get(ClubJobsRunner);
    queue = ctx.app.get<Queue>(getQueueToken(CLUB_JOBS_QUEUE));
    events = new QueueEvents(CLUB_JOBS_QUEUE, {
      connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      prefix: process.env.QUEUE_PREFIX,
    });
    await events.waitUntilReady();
  });
  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await events?.close();
    await ctx?.close();
    process.env.JOBS_ENABLED = saved.jobs;
    process.env.QUEUE_PREFIX = saved.prefix;
  });

  beforeEach(async () => {
    await queue.drain(true);
    await resetDatabase(ctx);
    other = await seedClub(ctx, { slug: "outro" });
    ficc = await seedClub(ctx);
  });

  /** A pending booking (created through the API) in the given club. */
  async function pendingBooking(club: Club, slug?: string) {
    ctx.useClub(club.id);
    const ana = await createMember(ctx.prisma, { name: `Ana ${club.slug}` });
    const bruno = await createMember(ctx.prisma, { name: `Bruno ${club.slug}` });
    const agent = await ctx.loginMember(ana.membershipId!, slug);
    if (slug) agent.set("x-test-club", slug);
    const created = await agent
      .post(ctx.api("/bookings"))
      .send({
        courtId: club.courts.Q1.id,
        timeSlotId: club.slots["18:30"]!.id,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(201);
    return created.body.id as string;
  }

  it("keeps one scheduler per job", async () => {
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((scheduler) => scheduler.key).sort()).toEqual(
      Object.keys(CLUB_JOBS).sort(),
    );
    for (const scheduler of schedulers) {
      expect(Number(scheduler.every)).toBe(
        CLUB_JOBS[scheduler.key as keyof typeof CLUB_JOBS].every,
      );
    }
  });

  it("runs a queued job for every club in its own tenant context, idempotently", async () => {
    const ficcBooking = await pendingBooking(ficc);
    const otherBooking = await pendingBooking(other, other.slug);
    ctx.clock.advance(2 * 60 * 60 * 1000);

    const job = await queue.add("bookings.expire-pending", {});
    expect(await job.waitUntilFinished(events, 15_000)).toEqual({ ficc: 1, outro: 1 });
    const rows = await ctx.base.booking.findMany({
      select: { id: true, status: true, clubId: true },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: ficcBooking, status: "CANCELLED", clubId: ficc.id },
        { id: otherBooking, status: "CANCELLED", clubId: other.id },
      ]),
    );

    // Running it again changes nothing.
    expect(await runner.run("bookings.expire-pending")).toEqual({
      ficc: 0,
      outro: 0,
    });
  });

  it("keeps running the other clubs when one club fails", async () => {
    // A club whose settings cannot be read must not stop the job elsewhere.
    await ctx.base.clubSettings.update({
      where: { clubId: other.id },
      data: { values: { eloKFactor: "not-a-number" } },
    });
    ctx.invalidateClubs();
    expect(await runner.run("matches.auto-approve")).toEqual({
      outro: { error: expect.any(String) },
      ficc: 0,
    });
  });
});
