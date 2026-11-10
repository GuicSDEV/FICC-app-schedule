import { Role } from "@ficc/db";
import type {
  AdminCategoryItem,
  LeaderboardResponse,
  SeasonDetail,
  SeasonListItem,
  SeasonSummary,
} from "@ficc/shared";
import type TestAgent from "supertest/lib/agent";

import { SeasonsService } from "../src/ranking/seasons.service";
import { createTestApp, type TestContext } from "./support/app";
import { createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo (the fake clock's default). */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";

describe("Ranking seasons and classes", () => {
  let ctx: TestContext;
  let admin$: TestAgent;
  let ana$: TestAgent;
  let ids: { ana: string; bia: string };

  const board = async (agent: TestAgent, category?: string) =>
    (await agent.get(ctx.api(`/leaderboard${category ? `?category=${category}` : ""}`)).expect(200))
      .body as LeaderboardResponse;
  /** Ana beats Bia (reported by Ana, approved by Bia). */
  const play = async () => {
    const reported = await ana$
      .post(ctx.api("/matches"))
      .ok(() => true)
      .send({
        format: "SINGLES",
        playedOn: "2030-03-04",
        surface: "SAIBRO",
        sideA: [ids.ana],
        sideB: [ids.bia],
        score: [
          { a: 6, b: 2 },
          { a: 6, b: 3 },
        ],
      });
    if (reported.status !== 201) throw new Error(JSON.stringify(reported.body));
    const bia$ = await ctx.loginMember("6002");
    await bia$.post(ctx.api(`/matches/${reported.body.id}/approve`)).expect(200);
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
    await seedClub(ctx);
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Super Admin");
    const ana = await createMember(ctx.prisma, { membershipId: "6001", name: "Ana" });
    const bia = await createMember(ctx.prisma, { membershipId: "6002", name: "Bia" });
    ids = { ana: ana.id, bia: bia.id };
    admin$ = await ctx.loginStaff("admin@ficc.test");
    ana$ = await ctx.loginMember("6001");
  });

  it("closing a season saves its table, resets ratings and counts the new season from zero", async () => {
    expect((await board(ana$)).season).toBeNull();
    await play();
    ctx.clock.advance(60_000);
    const first = (
      await admin$
        .post(ctx.api("/admin/ranking/seasons"))
        .send({ name: "1º semestre", endDate: "2030-06-30" })
        .expect(201)
    ).body as SeasonSummary;
    // Days are club dates: it ends at midnight after its last day, São Paulo time.
    expect(first.endsAt).toBe("2030-07-01T03:00:00.000Z");
    // Matches before the season do not count in it.
    ctx.clock.advance(60_000);
    expect((await board(ana$)).entries.find((e) => e.player.id === ids.ana)?.wins).toBe(0);

    await play();
    const during = await board(ana$);
    expect(during.season?.name).toBe("1º semestre");
    const ana = during.entries.find((entry) => entry.player.id === ids.ana)!;
    expect(ana).toMatchObject({ rank: 1, wins: 1, losses: 0 });
    expect(ana.elo).toBeGreaterThan(1200);

    // The admin closes it and starts the next one: table saved, everyone back to 1200.
    ctx.clock.advance(60_000);
    await admin$.post(ctx.api("/admin/ranking/seasons")).send({ name: "2º semestre" }).expect(201);
    const after = await board(ana$);
    expect(after.season).toMatchObject({ name: "2º semestre", endsAt: null });
    expect(after.entries.every((entry) => entry.elo === 1200 && entry.matches === 0)).toBe(true);

    const seasons = (await ana$.get(ctx.api("/ranking/seasons")).expect(200))
      .body as SeasonListItem[];
    expect(seasons).toHaveLength(1);
    expect(seasons[0]!.season.name).toBe("1º semestre");
    expect(seasons[0]!.podium.map((entry) => entry.player.name)).toEqual(["Ana", "Bia"]);
    const detail = (await ana$.get(ctx.api(`/ranking/seasons/${first.id}`)).expect(200))
      .body as SeasonDetail;
    expect(detail.standings[0]).toMatchObject({ rank: 1, wins: 1, losses: 0 });
    expect(detail.season.closedAt).not.toBeNull();

    // Members cannot manage seasons.
    await ana$.post(ctx.api("/admin/ranking/seasons")).send({ name: "x" }).expect(403);
  });

  it("a season with an end date closes on its own and the next one starts", async () => {
    const season = (
      await admin$
        .post(ctx.api("/admin/ranking/seasons"))
        .send({ name: "Março", endDate: "2030-03-10" })
        .expect(201)
    ).body as SeasonSummary;
    await admin$
      .patch(ctx.api(`/admin/ranking/seasons/${season.id}`))
      .send({ name: "Março", endDate: "2030-03-03" })
      .expect(422);
    const seasons = ctx.app.get(SeasonsService);
    await ctx.inClub(() => seasons.closeExpired());
    expect((await board(ana$)).season?.name).toBe("Março");
    ctx.clock.set("2030-03-11T03:00:00.000Z");
    await ctx.inClub(() => seasons.closeExpired());
    const next = await board(ana$);
    expect(next.season).toMatchObject({ name: "Temporada 11/03/2030", endsAt: null });
  });

  it("admin creates, renames and deletes classes and puts members in them", async () => {
    const created = (
      await admin$
        .post(ctx.api("/admin/ranking/categories"))
        .send({ name: "Sênior +60" })
        .expect(201)
    ).body as AdminCategoryItem;
    expect(created).toMatchObject({ key: "SENIOR_60", name: "Sênior +60", members: 0 });
    await admin$
      .post(ctx.api("/admin/ranking/categories"))
      .send({ name: "sênior +60" })
      .expect(409);

    await admin$
      .put(ctx.api(`/admin/members/${ids.ana}/categories`))
      .send({ keys: ["SENIOR_60"] })
      .expect(200);
    expect((await board(ana$, "SENIOR_60")).entries.map((entry) => entry.player.name)).toEqual([
      "Ana",
    ]);

    await admin$
      .patch(ctx.api(`/admin/ranking/categories/${created.id}`))
      .send({ name: "Veteranos" })
      .expect(200);
    const list = (await admin$.get(ctx.api("/admin/ranking/categories")).expect(200))
      .body as AdminCategoryItem[];
    expect(list.find((entry) => entry.id === created.id)).toMatchObject({
      name: "Veteranos",
      members: 1,
    });
    await admin$.delete(ctx.api(`/admin/ranking/categories/${created.id}`)).expect(204);
    await ana$.get(ctx.api("/leaderboard?category=SENIOR_60")).expect(400);
  });
});
