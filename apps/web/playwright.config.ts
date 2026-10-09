import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests of the main journeys. They run against the production builds
 * (`pnpm build` first) on a freshly seeded database: the global setup runs `pnpm db:seed`, which
 * WIPES the database in DATABASE_URL. Start PostgreSQL and Redis (`docker compose up -d`) before.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";
// Optional: a Chromium already installed on the machine instead of `playwright install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const ARTIFACTS = path.join(__dirname, "e2e", ".artifacts");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    launchOptions: { executablePath },
  },
  projects: [
    { name: "journeys", testIgnore: /gate\.spec\.ts/ },
    {
      name: "gate",
      testMatch: /gate\.spec\.ts/,
      use: {
        permissions: ["camera"],
        launchOptions: {
          executablePath,
          // The gate camera "films" the QR of the guest pass created in the global setup.
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-video-capture=${path.join(ARTIFACTS, "guest-pass.y4m")}`,
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: "node dist/main",
      cwd: path.join(__dirname, "../api"),
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm start",
      cwd: __dirname,
      url: `${BASE_URL}/login`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
