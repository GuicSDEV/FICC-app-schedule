import { expect, test } from "@playwright/test";

import { addDays, apiAs, getJson, login } from "./support";

interface Day {
  courts: { id: string; name: string }[];
  cells: {
    courtId: string;
    state: string;
    past: boolean;
    lesson: { coach: { displayName: string } } | null;
  }[];
}

test("an admin cancels a coach's lesson from the bookings calendar", async ({ page }) => {
  // A coming lesson in the next days.
  const adminApi = await apiAs({ email: "admin@ficc.test" });
  const { today } = await getJson<{ today: string }>(adminApi, "courts");
  let found: { date: string; court: string; coach: string } | null = null;
  for (let offset = 1; offset < 10 && !found; offset++) {
    const date = addDays(today, offset);
    const day = await getJson<Day>(adminApi, `schedule?date=${date}`);
    const cell = day.cells.find((entry) => entry.state === "lesson" && !entry.past && entry.lesson);
    if (cell) {
      found = {
        date,
        court: day.courts.find((court) => court.id === cell.courtId)!.name,
        coach: cell.lesson!.coach.displayName,
      };
    }
  }
  await adminApi.dispose();
  expect(found, "a coming lesson").not.toBeNull();
  const { date, court, coach } = found!;

  await login(page, { email: "admin@ficc.test" });
  await page.goto("/admin/bookings");
  const dayLoaded = page.waitForResponse((response) =>
    response.url().includes(`/schedule?date=${date}`),
  );
  await page.locator(`[data-date="${date}"]`).click();
  await dayLoaded;
  const lessons = page.locator(`button[aria-label*="${court}"][aria-label*="aula com ${coach}"]`);
  const before = await lessons.count();
  await lessons.first().click();
  await page.getByRole("button", { name: /Cancelar só este dia/ }).click();
  await expect(lessons).toHaveCount(before - 1);
});
