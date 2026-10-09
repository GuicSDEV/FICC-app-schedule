import { expect, test } from "@playwright/test";

import { login } from "./support";

// The fake camera plays the QR of the guest pass created in global-setup.ts.
test("the gate scans a guest pass: accepted once, refused when reused", async ({ page }) => {
  await login(page, { email: "portaria@ficc.test" });
  await expect(page).toHaveURL(/\/gate$/);

  const result = page.getByRole("alertdialog");
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toHaveAttribute("aria-label", /Entrada liberada/);
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(result).toHaveCount(0);

  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toHaveAttribute("aria-label", /já utilizado/i);
  await page.getByRole("button", { name: "Próximo" }).click();

  await page.getByRole("radio", { name: "Histórico" }).click();
  await expect(page.getByText("Joana Prado").first()).toBeVisible();
});
