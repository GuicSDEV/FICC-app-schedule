import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { login } from "./support";

const { inTwoDays } = JSON.parse(
  readFileSync(path.join(__dirname, ".artifacts", "dates.json"), "utf8"),
) as { inTwoDays: string };

test("a member books singles with a guest registered from the booking sheet", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, { member: "108903" });
  await page.goto("/app/courts");
  const dayLoaded = page.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${inTwoDays}`),
  );
  await page.locator(`[data-date="${inTwoDays}"]`).click();
  await dayLoaded;
  // A morning slot (the club may keep evenings free of guests).
  await page
    .locator(`[data-day="${inTwoDays}"] button[aria-label*="livre"][aria-disabled="false"]`)
    .first()
    .click();

  const sheet = page.getByRole("dialog", { name: "Reservar quadra" });
  await sheet.getByRole("button", { name: "Novo convidado" }).click();
  const guestSheet = page.getByRole("dialog", { name: "Novo convidado" });
  await guestSheet.getByLabel("Nome completo do convidado").fill("Carlos Souza");
  await guestSheet.locator("#guest-document").fill("529.982.247-25");
  await page.screenshot({ path: testInfo.outputPath("guest-form.png") });
  await guestSheet.getByRole("button", { name: "Criar passe" }).click();

  // Back on the booking with the guest chosen: one spot filled, ready to book.
  await expect(sheet.getByRole("button", { name: "Carlos Souza" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: testInfo.outputPath("guest-chosen.png") });
  await sheet.getByRole("button", { name: /^Reservar Q/ }).click();
  await expect(page.getByText("Quadra reservada!")).toBeVisible();
});
