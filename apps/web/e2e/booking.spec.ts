import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { apiAs, getJson, login } from "./support";

const { inTwoDays } = JSON.parse(
  readFileSync(path.join(__dirname, ".artifacts", "dates.json"), "utf8"),
) as { inTwoDays: string };

test("a member books a free court with a partner and another member sees it taken", async ({
  page,
  browser,
}) => {
  await login(page, { member: "112573" });
  await page.goto("/app/courts");
  const dayLoaded = page.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${inTwoDays}`),
  );
  await page.locator(`[data-date="${inTwoDays}"]`).click();
  await dayLoaded;
  await expect(page.locator(`[data-date="${inTwoDays}"]`)).toHaveAttribute("aria-checked", "true");

  const free = page.locator('button[aria-label*="livre"][aria-disabled="false"]').first();
  const label = (await free.getAttribute("aria-label")) ?? "";
  const court = /Quadra (Q\d)/.exec(label)?.[1];
  expect(court).toBeTruthy();
  await free.click();

  await page.getByPlaceholder("Nome ou matrícula").fill("Bea");
  await page.getByRole("option").first().locator("button").click();
  await page.getByRole("button", { name: /^Reservar Q/ }).click();
  await expect(page.getByText("Quadra reservada!")).toBeVisible();

  // The booking exists for the API too.
  const api = await apiAs({ member: "112573" });
  const mine = await getJson<{ upcoming: { date: string; court: { name: string } }[] }>(
    api,
    "bookings/mine",
  );
  expect(
    mine.upcoming.some((booking) => booking.date === inTwoDays && booking.court.name === court),
  ).toBe(true);
  await api.dispose();

  // Another member's calendar shows the cell as reserved.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, { member: "112994" });
  await otherPage.goto("/app/courts");
  const otherDay = otherPage.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${inTwoDays}`),
  );
  await otherPage.locator(`[data-date="${inTwoDays}"]`).click();
  await otherDay;
  await expect(
    otherPage.locator(`button[aria-label^="Quadra ${court}, reservad"]`).first(),
  ).toBeVisible();
  await other.close();
});
