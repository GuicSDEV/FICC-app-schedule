import { expect, test } from "@playwright/test";

import { addDays, apiAs, getJson, login } from "./support";

interface AgendaDay {
  courts: { id: string; name: string }[];
  slots: { id: string; startTime: string }[];
  cells: {
    courtId: string;
    timeSlotId: string;
    state: string;
    past: boolean;
    lesson: { coach: { displayName: string } } | null;
  }[];
}

test("a coach cancels a lesson and a member books the freed slot", async ({ page, browser }) => {
  // Find one of Alan's coming lessons inside the members' booking window.
  const coachApi = await apiAs({ email: "alan@ficc.test" });
  const { today } = await getJson<{ today: string }>(coachApi, "courts");
  let lesson: { date: string; court: string; time: string } | null = null;
  for (let offset = 1; offset < 10 && !lesson; offset++) {
    const date = addDays(today, offset);
    const day = await getJson<AgendaDay>(coachApi, `coach/agenda?date=${date}`);
    const cell = day.cells.find(
      (entry) =>
        entry.state === "lesson" && !entry.past && entry.lesson?.coach.displayName === "Alan",
    );
    if (cell) {
      lesson = {
        date,
        court: day.courts.find((court) => court.id === cell.courtId)!.name,
        time: day.slots.find((slot) => slot.id === cell.timeSlotId)!.startTime,
      };
    }
  }
  await coachApi.dispose();
  expect(lesson, "a coming lesson of Alan").not.toBeNull();
  const { date, court, time } = lesson!;

  // Coach: cancel only that day.
  await login(page, { email: "alan@ficc.test" });
  await page.locator(`[data-date="${date}"]`).click();
  const card = page.locator(`button[aria-label="Aula na ${court} às ${time}. Ver ações"]:visible`);
  await card.first().click();
  await page.getByRole("button", { name: /Cancelar só este dia/ }).click();
  await expect(card).toHaveCount(0);

  // Member: the slot is free now and can be booked.
  const member = await browser.newContext();
  const memberPage = await member.newPage();
  await login(memberPage, { member: "111305" });
  await memberPage.goto("/app/courts");
  const dayLoaded = memberPage.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${date}`),
  );
  await memberPage.locator(`[data-date="${date}"]`).click();
  await dayLoaded;
  const row = memberPage
    .locator("div.grid", { has: memberPage.getByText(time, { exact: true }) })
    .last();
  await row.locator(`button[aria-label^="Quadra ${court}, livre"]`).first().click();
  await memberPage.getByPlaceholder("Nome ou matrícula").fill("Gabriel");
  await memberPage.getByRole("option").first().locator("button").click();
  await memberPage.getByRole("button", { name: /^Reservar Q/ }).click();
  await expect(memberPage.getByText("Quadra reservada!")).toBeVisible();
  await member.close();
});
