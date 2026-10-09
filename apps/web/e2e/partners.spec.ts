import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { addDays, login } from "./support";

const { today } = JSON.parse(
  readFileSync(path.join(__dirname, ".artifacts", "dates.json"), "utf8"),
) as { today: string };

/** The next day after today that takes bookings (Saturdays are free play at FICC). */
function nextBookingDay(): string {
  for (let offset = 1; ; offset += 1) {
    const date = addDays(today, offset);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 6) return date;
  }
}

async function openDay(page: Page, date: string) {
  await page.goto("/app/courts");
  const dayLoaded = page.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${date}`),
  );
  await page.locator(`[data-date="${date}"]`).click();
  await dayLoaded;
}

test("a member looks for a partner and another member books a court with them", async ({
  page,
  browser,
}) => {
  const date = nextBookingDay();
  await login(page, { member: "106840" });
  await openDay(page, date);

  const card = page.locator("#procurando-parceiro");
  await card.getByRole("button", { name: "Procuro parceiro" }).click();
  const sheet = page.getByRole("dialog", { name: "Procuro parceiro" });
  const time = sheet.getByRole("radio").first();
  const startTime = (await time.textContent())?.trim() ?? "";
  await time.click();
  await sheet.getByLabel("Recado (opcional)").fill("Jogo leve, nível intermediário");
  await sheet.getByRole("button", { name: "Avisar os sócios" }).click();
  await expect(
    page.getByText("Pronto! Os sócios já veem que você procura parceiro."),
  ).toBeVisible();
  await expect(card.getByText("Jogo leve, nível intermediário")).toBeVisible();

  // Another member sees the request on that day and plays with her.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, { member: "107215" });
  await openDay(otherPage, date);
  const otherCard = otherPage.locator("#procurando-parceiro");
  const request = otherCard.getByRole("listitem").filter({ hasText: "Juliana Costa" });
  await expect(request).toContainText(startTime);
  await request.getByRole("button", { name: "Jogar" }).click();

  const booking = otherPage.getByRole("dialog", { name: "Reservar quadra" });
  await expect(booking.getByText("Quadra guardada para você")).toBeVisible();
  await expect(booking.getByRole("list", { name: "Jogadores escolhidos" })).toContainText(
    "Juliana Costa",
  );
  await booking.getByRole("button", { name: /^Reservar Q/ }).click();
  await expect(otherPage.getByText("Quadra reservada!")).toBeVisible();

  // The request is answered: it leaves both lists.
  await expect(card.getByText("Jogo leve, nível intermediário")).toHaveCount(0);
  await other.close();
});

test("the ranking search finds a member with their position and opens the profile", async ({
  page,
}) => {
  await login(page, { member: "107215" });
  await page.goto("/app/ranking");
  await page.getByRole("searchbox", { name: "Buscar sócio no ranking" }).fill("juliana");
  const results = page.getByRole("region", { name: "Resultado da busca" });
  await expect(results.getByText("1 sócio encontrado")).toBeVisible();
  const row = results.getByRole("link", { name: /Juliana Costa/ });
  await expect(row).toBeVisible();
  // Its position on the board.
  await expect(row.locator("span").first()).toHaveText(/^\d+$/);
  await row.click();
  await expect(page).toHaveURL(/\/app\/players\//);
  await expect(page.getByRole("heading", { name: "Juliana Costa" })).toBeVisible();
});
