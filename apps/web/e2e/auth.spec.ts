import { expect, test } from "@playwright/test";

import { login, type Who } from "./support";

const ROLES: { name: string; who: Who; area: RegExp; heading: RegExp }[] = [
  {
    name: "member (matrícula)",
    who: { member: "104218" },
    area: /\/app$/,
    heading: /Início/,
  },
  { name: "coach", who: { email: "alan@ficc.test" }, area: /\/coach$/, heading: /Agenda/ },
  {
    name: "admin (super admin)",
    who: { email: "admin@ficc.test" },
    area: /\/admin$/,
    heading: /Interdições/,
  },
  { name: "secretaria", who: { email: "secretaria@ficc.test" }, area: /\/admin/, heading: /.+/ },
  { name: "gate", who: { email: "portaria@ficc.test" }, area: /\/gate$/, heading: /Portaria/ },
];

for (const role of ROLES) {
  test(`logs in as ${role.name} and lands in the right area`, async ({ page }) => {
    await login(page, role.who);
    await expect(page).toHaveURL(role.area);
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(role.heading);
  });
}

test("each role is kept out of the other areas", async ({ page }) => {
  await login(page, { member: "104218" });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
});

test("secretaria sees only the admin pages of her role", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, { email: "secretaria@ficc.test" });
  const nav = page.locator("aside nav");
  await expect(nav.getByRole("link", { name: "Mural" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sócios" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Equipe" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Torneios" })).toHaveCount(0);
});

test("wrong password shows an error and stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Matrícula").fill("104218");
  await page.getByLabel("Senha", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
