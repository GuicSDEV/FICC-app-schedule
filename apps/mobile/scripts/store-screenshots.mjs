#!/usr/bin/env node
/**
 * Store screenshots at the sizes App Store Connect and Google Play ask for, taken from the web app
 * with the demo data (`pnpm db:seed`). Saves PNGs in apps/mobile/store/screenshots/<device>/.
 *
 *   APP_URL=https://<demo>.up.railway.app SHOT_LOGIN=104218 SHOT_PASSWORD=demo1234 \
 *     pnpm --filter @ficc/mobile screenshots
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Playwright comes with the web app's browser tests.
const require = createRequire(join(root, "../web/package.json"));
const { chromium } = require("@playwright/test");

const url = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const login = process.env.SHOT_LOGIN ?? "104218";
const password = process.env.SHOT_PASSWORD;
if (!password) {
  console.error("Set SHOT_PASSWORD (the demo password) and APP_URL.");
  process.exit(1);
}

/** Viewport × scale = the pixel size each store expects. */
const DEVICES = {
  "iphone-6.9": { width: 440, height: 956, scale: 3 }, // 1320 × 2868
  "iphone-6.5": { width: 428, height: 926, scale: 3 }, // 1284 × 2778
  "android-phone": { width: 360, height: 800, scale: 3 }, // 1080 × 2400
};
const SCREENS = [
  ["01-inicio", "/app"],
  ["02-quadras", "/app/courts"],
  ["03-quadras-agora", "/app/courts-now"],
  ["04-ranking", "/app/ranking"],
  ["05-partidas", "/app/matches"],
  ["06-perfil", "/app/profile"],
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
for (const [name, device] of Object.entries(DEVICES)) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    locale: "pt-BR",
  });
  const page = await context.newPage();
  await page.goto(`${url}/login`);
  await page.getByRole("textbox").first().fill(login);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  const folder = join(root, "store/screenshots", name);
  mkdirSync(folder, { recursive: true });
  for (const [file, path] of SCREENS) {
    await page.goto(`${url}${path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(folder, `${file}.png`) });
  }
  await context.close();
  console.log(`${name}: ${SCREENS.length} screenshots`);
}
await browser.close();
