import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { tenantExtension } from "@ficc/db";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";

import { API_PREFIX } from "../../src/api-prefix";
import { AppModule } from "../../src/app.module";
import { Clock } from "../../src/common/clock";
import { configureApp } from "../../src/configure-app";
import { PrismaBaseService } from "../../src/prisma/prisma.service";
import { ClubResolver, type ClubRequestInfo } from "../../src/tenancy/club-resolver";
import { ClubsService } from "../../src/tenancy/clubs.service";
import { runWithTenant, tenantOrUndefined } from "../../src/tenancy/tenant-context";
import { FakeClock } from "./fake-clock";
import { TEST_PASSWORD } from "./fixtures";

/** Header the e2e tests use to address a club other than the default one. */
export const TEST_CLUB_HEADER = "x-test-club";

/**
 * Production resolves the club from DEFAULT_CLUB_SLUG only. The tests also need to reach a second
 * club (isolation test), so this test-only resolver honours a header and falls back to the default.
 */
class TestClubResolver extends ClubResolver {
  override resolveSlug(request: ClubRequestInfo): string {
    const header = request.headers?.[TEST_CLUB_HEADER];
    return (typeof header === "string" && header) || super.resolveSlug(request);
  }
}

export interface TestContext {
  app: INestApplication;
  /** Unscoped client (resets, clubs). */
  base: PrismaBaseService;
  /** Club-scoped client for fixtures: the current test club (see useClub). */
  prisma: ReturnType<typeof scopedClient>;
  clock: FakeClock;
  /** URL path for an API route, e.g. api("/auth/login") → "/api/v1/auth/login". */
  api: (path: string) => string;
  /** Club the fixtures (and inClub) work with. */
  useClub: (clubId: string) => void;
  currentClubId: () => string;
  /** Runs service code (jobs, direct calls) inside the current club's tenant context. */
  inClub: <T>(work: () => Promise<T>) => Promise<T>;
  /** Forget cached clubs (their ids change after every reset). */
  invalidateClubs: () => void;
  /** Anonymous request helper. */
  http: () => TestAgent;
  /** Logs in and returns a cookie-carrying agent. */
  loginMember: (membershipId: string, clubSlug?: string) => Promise<TestAgent>;
  loginStaff: (email: string, clubSlug?: string) => Promise<TestAgent>;
  close: () => Promise<void>;
}

function scopedClient(base: PrismaBaseService, clubId: () => string | undefined) {
  return base.$extends(tenantExtension(() => tenantOrUndefined()?.clubId ?? clubId()));
}

export async function createTestApp(options: { listen?: boolean } = {}): Promise<TestContext> {
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(ClubResolver)
    .useClass(TestClubResolver)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ["error"] });
  configureApp(app);
  if (options.listen) {
    await app.listen(0);
  } else {
    await app.init();
  }
  const base = app.get(PrismaBaseService);
  const clubs = app.get(ClubsService);
  const server = app.getHttpServer();
  let currentClubId: string | undefined;
  const api = (path: string) => `/${API_PREFIX}${path}`;

  const login = async (body: object, clubSlug?: string) => {
    const agent = request.agent(server);
    if (clubSlug) agent.set(TEST_CLUB_HEADER, clubSlug);
    const response = await agent
      .post(api("/auth/login"))
      .send({ ...body, password: TEST_PASSWORD });
    if (response.status !== 200) {
      throw new Error(`login failed (${response.status}): ${JSON.stringify(response.body)}`);
    }
    return agent;
  };

  return {
    app,
    base,
    prisma: scopedClient(base, () => currentClubId),
    clock,
    api,
    useClub: (clubId) => {
      currentClubId = clubId;
    },
    currentClubId: () => {
      if (!currentClubId) throw new Error("No test club: call seedClub(ctx) first");
      return currentClubId;
    },
    inClub: async (work) => {
      if (!currentClubId) throw new Error("No test club: call seedClub(ctx) first");
      const club = await clubs.tenantById(currentClubId);
      return runWithTenant(club, work);
    },
    invalidateClubs: () => clubs.invalidate(),
    http: () => request.agent(server),
    loginMember: (membershipId, clubSlug) => login({ kind: "member", membershipId }, clubSlug),
    loginStaff: (email, clubSlug) => login({ kind: "staff", email }, clubSlug),
    close: () => app.close(),
  };
}
