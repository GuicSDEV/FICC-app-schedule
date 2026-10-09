import { execSync } from "node:child_process";
import path from "node:path";

import { PrismaClient } from "@ficc/db";

import { testDatabaseUrl } from "../support/database-url";

/** Creates the e2e database if needed and applies every migration once per test run. */
export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.slice(1);
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  maintenance.search = "";

  const admin = new PrismaClient({ datasourceUrl: maintenance.toString() });
  try {
    const existing = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../../../../packages/db"),
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });
}
