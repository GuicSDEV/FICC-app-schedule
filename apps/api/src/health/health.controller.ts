import { Controller, Get } from "@nestjs/common";

import { Public } from "../common/auth.decorators";
import { PrismaBaseService } from "../prisma/prisma.service";

export interface HealthResponse {
  status: "ok";
  service: "api";
  database: "up" | "down";
  time: string;
}

/** Liveness probe: public and outside any club (it must answer even when the database is down). */
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaBaseService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    return {
      status: "ok",
      service: "api",
      database: (await this.isDatabaseUp()) ? "up" : "down",
      time: new Date().toISOString(),
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
