import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { login } from "./support";

const { inTwoDays } = JSON.parse(
  readFileSync(path.join(__dirname, ".artifacts", "dates.json"), "utf8"),
) as { inTwoDays: string };

async function openDay(page: Page) {
  await page.goto("/app/courts");
  const dayLoaded = page.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${inTwoDays}`),
  );
  await page.locator(`[data-date="${inTwoDays}"]`).click();
  await dayLoaded;
}

test("a tapped court is kept for its member; the next one waits and gets it when they give up", async ({
  page,
  browser,
}) => {
  await login(page, { member: "108122" });
  await openDay(page);
  const free = page
    .locator(`[data-day="${inTwoDays}"] button[aria-label*="livre"][aria-disabled="false"]`)
    .first();
  const label = (await free.getAttribute("aria-label")) ?? "";
  const court = /Quadra (Q\d)/.exec(label)?.[1];
  expect(court).toBeTruthy();

  // The second member opens the same day before the first one taps.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, { member: "108459" });
  await openDay(otherPage);

  // First tap: the court is kept while the member picks a partner.
  await free.click();
  await expect(page.getByText("Quadra guardada para você")).toBeVisible();

  // The other calendar shows it as being booked, and tapping it opens the waiting screen.
  const held = otherPage
    .locator(`[data-day="${inTwoDays}"] button[aria-label^="Quadra ${court}, outro sócio"]`)
    .first();
  await expect(held).toBeVisible();
  await held.click();
  await expect(
    otherPage.getByRole("heading", { name: "Outro sócio está reservando esta quadra" }),
  ).toBeVisible();
  await expect(otherPage.getByText("1º")).toBeVisible();

  // The first member gives up: the court passes to the one waiting, booking sheet open.
  await page.keyboard.press("Escape");
  await expect(otherPage.getByText(`É a sua vez! A quadra ${court}`)).toBeVisible();
  await expect(otherPage.getByText("Quadra guardada para você")).toBeVisible();
  await expect(otherPage.getByRole("dialog", { name: "Reservar quadra" })).toBeVisible();
  await other.close();
});
