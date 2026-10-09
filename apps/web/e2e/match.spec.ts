import { expect, test } from "@playwright/test";

import { apiAs, getJson, login } from "./support";

interface Profile {
  player: { id: string; elo: number; membershipId: string | null };
}

test("a member reports a win, the opponent approves and both ratings move", async ({
  page,
  browser,
}) => {
  const reporter = { member: "113781" };
  const opponent = { member: "114215" };
  const reporterApi = await apiAs(reporter);
  const opponentApi = await apiAs(opponent);
  const me = await getJson<{ id: string }>(reporterApi, "auth/me");
  const them = await getJson<{ id: string }>(opponentApi, "auth/me");
  const before = await getJson<Profile>(reporterApi, `players/${me.id}`);
  const opponentBefore = await getJson<Profile>(reporterApi, `players/${them.id}`);

  // Reporter: 6-1 6-2 against the opponent.
  await login(page, reporter);
  await page.goto("/app/matches/report");
  await page.getByRole("combobox").fill(opponent.member);
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: /^Q1/ }).click();
  const increase = (set: number, side: string) =>
    page.getByRole("button", { name: `Aumentar Set ${set}, ${side}` });
  for (let index = 0; index < 6; index++) await increase(1, "Você").click();
  await increase(1, "Adversário").click();
  for (let index = 0; index < 6; index++) await increase(2, "Você").click();
  for (let index = 0; index < 2; index++) await increase(2, "Adversário").click();
  await page.getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(page).toHaveURL(/[?&]m=/);

  // Opponent: approve from the matches list.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, opponent);
  await otherPage.goto("/app/matches");
  await otherPage.locator('button[aria-label^="Partida"]').first().click();
  await otherPage.getByRole("button", { name: "Aprovar" }).click();

  // Reporter sees the win celebration; the ladder moved by the same amount both ways.
  await expect(page.getByRole("dialog", { name: "Vitória confirmada" })).toBeVisible();
  const after = await getJson<Profile>(reporterApi, `players/${me.id}`);
  const opponentAfter = await getJson<Profile>(reporterApi, `players/${them.id}`);
  const gained = after.player.elo - before.player.elo;
  expect(gained).toBeGreaterThan(0);
  expect(opponentBefore.player.elo - opponentAfter.player.elo).toBe(gained);
  await other.close();
  await Promise.all([reporterApi.dispose(), opponentApi.dispose()]);
});
