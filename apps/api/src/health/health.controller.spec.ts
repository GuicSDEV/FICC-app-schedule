import { Test } from "@nestjs/testing";

import { PrismaBaseService } from "../prisma/prisma.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  async function createController(queryRaw: jest.Mock): Promise<HealthController> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaBaseService, useValue: { $queryRaw: queryRaw } }],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it("reports the database as up when a query succeeds", async () => {
    const controller = await createController(jest.fn().mockResolvedValue([{ "?column?": 1 }]));

    const health = await controller.check();

    expect(health).toMatchObject({
      status: "ok",
      service: "api",
      database: "up",
    });
    expect(Number.isNaN(Date.parse(health.time))).toBe(false);
  });

  it("reports the database as down instead of failing when the query throws", async () => {
    const controller = await createController(
      jest.fn().mockRejectedValue(new Error("connection refused")),
    );

    await expect(controller.check()).resolves.toMatchObject({ status: "ok", database: "down" });
  });
});
