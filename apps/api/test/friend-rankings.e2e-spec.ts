import { Role } from "@ficc/db";
import type { FriendRankingDetail, FriendRankingSummary } from "@ficc/shared";
import type TestAgent from "supertest/lib/agent";

import { createTestApp, type TestContext } from "./support/app";
import { createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo (the fake clock's default). */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";

describe("Private rankings among friends", () => {
  let ctx: TestContext;
  let agents: Record<"ana" | "bia" | "caio" | "dani", TestAgent>;
  let ids: Record<"ana" | "bia" | "caio" | "dani", string>;

  /** `winner` beats `loser` on `playedOn`, reported by the winner and approved by the loser. */
  const play = async (winner: keyof typeof ids, loser: keyof typeof ids, playedOn: string) => {
    const reported = await agents[winner]
      .post(ctx.api("/matches"))
      .send({
        format: "SINGLES",
        playedOn,
        surface: "SAIBRO",
        sideA: [ids[winner]],
        sideB: [ids[loser]],
        score: [
          { a: 6, b: 2 },
          { a: 6, b: 3 },
        ],
      })
      .expect(201);
    await agents[loser].post(ctx.api(`/matches/${reported.body.id}/approve`)).expect(200);
  };
  const table = async (agent: TestAgent, id: string, month?: string) =>
    (
      await agent
        .get(ctx.api(`/friend-rankings/${id}${month ? `?month=${month}` : ""}`))
        .expect(200)
    ).body as FriendRankingDetail;
  const line = (detail: FriendRankingDetail) =>
    detail.entries.map((entry) => `${entry.player.name}:${entry.wins}-${entry.losses}`);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set(MONDAY_9AM);
    await seedClub(ctx);
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Super Admin");
    const names = { ana: "Ana", bia: "Bia", caio: "Caio", dani: "Dani" } as const;
    ids = {} as typeof ids;
    agents = {} as typeof agents;
    let n = 5001;
    for (const key of Object.keys(names) as (keyof typeof names)[]) {
      const member = await createMember(ctx.prisma, {
        membershipId: String(n),
        name: names[key],
      });
      ids[key] = member.id;
      agents[key] = await ctx.loginMember(String(n));
      n += 1;
    }
  });

  it("counts wins this month, only among its members or in every match", async () => {
    // Before the month: does not count. In the month: Ana beats Bia twice, Bia beats Dani (outsider).
    await play("ana", "bia", "2030-02-27");
    await play("ana", "bia", "2030-03-02");
    await play("ana", "bia", "2030-03-03");
    await play("bia", "dani", "2030-03-04");

    const created = (
      await agents.ana
        .post(ctx.api("/friend-rankings"))
        .send({
          name: "Turma de quinta",
          scope: "AMONG_MEMBERS",
          period: "MONTHLY",
          memberIds: [ids.bia, ids.caio],
        })
        .expect(201)
    ).body as FriendRankingDetail;
    expect(created.month).toBe("2030-03");
    // Tied on wins: fewer losses first.
    expect(line(created)).toEqual(["Ana:2-0", "Caio:0-0", "Bia:0-2"]);
    expect(await ctx.prisma.notification.count({ where: { type: "FRIEND_RANKING_ADDED" } })).toBe(
      2,
    );

    // Every match: Bia's win over Dani (not in the ranking) counts too.
    await agents.ana
      .patch(ctx.api(`/friend-rankings/${created.id}`))
      .send({ name: "Turma de quinta", scope: "ALL_MATCHES", period: "MONTHLY" })
      .expect(200);
    expect(line(await table(agents.bia, created.id))).toEqual(["Ana:2-0", "Bia:1-2", "Caio:0-0"]);
    // Last month's table.
    expect(line(await table(agents.bia, created.id, "2030-02"))).toEqual([
      "Ana:1-0",
      "Caio:0-0",
      "Bia:0-1",
    ]);

    const list = (await agents.bia.get(ctx.api("/friend-rankings")).expect(200))
      .body as FriendRankingSummary[];
    expect(list).toEqual([
      expect.objectContaining({
        id: created.id,
        members: 3,
        myRank: 2,
        leader: expect.objectContaining({ name: "Ana" }),
      }),
    ]);
  });

  it("only members see it; the owner manages it; anyone can leave", async () => {
    const created = (
      await agents.ana
        .post(ctx.api("/friend-rankings"))
        .send({ name: "Duplas", scope: "ALL_MATCHES", period: "SINCE_START", memberIds: [ids.bia] })
        .expect(201)
    ).body as FriendRankingDetail;
    expect(created.month).toBeNull();
    await agents.dani.get(ctx.api(`/friend-rankings/${created.id}`)).expect(404);
    // Only the owner adds people or renames.
    await agents.bia
      .post(ctx.api(`/friend-rankings/${created.id}/members`))
      .send({ userIds: [ids.caio] })
      .expect(403);
    await agents.ana
      .post(ctx.api(`/friend-rankings/${created.id}/members`))
      .send({ userIds: [ids.caio] })
      .expect(200);
    await agents.caio.get(ctx.api(`/friend-rankings/${created.id}`)).expect(200);
    // Caio leaves; Bia cannot take Ana out.
    await agents.caio
      .delete(ctx.api(`/friend-rankings/${created.id}/members/${ids.caio}`))
      .expect(204);
    await agents.caio.get(ctx.api(`/friend-rankings/${created.id}`)).expect(404);
    await agents.bia
      .delete(ctx.api(`/friend-rankings/${created.id}/members/${ids.ana}`))
      .expect(403);
    // The owner deletes it.
    await agents.ana.delete(ctx.api(`/friend-rankings/${created.id}`)).expect(204);
    expect((await agents.bia.get(ctx.api("/friend-rankings")).expect(200)).body).toEqual([]);
  });
});
