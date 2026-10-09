import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@ficc/db";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";

import { AppModule } from "../../src/app.module";
import { Clock } from "../../src/common/clock";
import { configureApp } from "../../src/configure-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import { FakeClock } from "./fake-clock";
import { TEST_PASSWORD } from "./fixtures";

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  clock: FakeClock;
  /** Anonymous request helper. */
  http: () => TestAgent;
  /** Logs in and returns a cookie-carrying agent. */
  loginMember: (membershipId: string) => Promise<TestAgent>;
  loginStaff: (email: string) => Promise<TestAgent>;
  close: () => Promise<void>;
}

export async function createTestApp(options: { listen?: boolean } = {}): Promise<TestContext> {
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ["error"] });
  configureApp(app);
  if (options.listen) {
    await app.listen(0);
  } else {
    await app.init();
  }
  const prisma = app.get(PrismaService);
  const server = app.getHttpServer();

  const login = async (body: object) => {
    const agent = request.agent(server);
    const response = await agent.post("/api/auth/login").send({ ...body, password: TEST_PASSWORD });
    if (response.status !== 200) {
      throw new Error(`login failed (${response.status}): ${JSON.stringify(response.body)}`);
    }
    return agent;
  };

  return {
    app,
    prisma,
    clock,
    http: () => request.agent(server),
    loginMember: (membershipId) => login({ kind: "member", membershipId }),
    loginStaff: (email) => login({ kind: "staff", email }),
    close: () => app.close(),
  };
}
