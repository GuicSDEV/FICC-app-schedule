import { Controller, Get } from "@nestjs/common";
import { CLUB_TIMEZONE } from "@ficc/shared";

import { PrismaService } from "../prisma/prisma.service";

export interface HealthResponse {
  status: "ok";
  service: "api";
  database: "up" | "down";
  timezone: string;
  time: string;
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    return {
      status: "ok",
      service: "api",
      database: (await this.isDatabaseUp()) ? "up" : "down",
      timezone: CLUB_TIMEZONE,
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
