import { type APIRequestContext, expect, type Page, request } from "@playwright/test";

export const API_URL = `${process.env.E2E_API_URL ?? "http://localhost:4000"}/api/v1`;
/** Every seeded account uses this password (packages/db/prisma/seed, SEED_PASSWORD). */
export const PASSWORD = process.env.SEED_PASSWORD || "ficc1234";

export type Who = { member: string } | { email: string };

/** Logs in through the login screen and waits for the role's area. */
export async function login(page: Page, who: Who): Promise<void> {
  await page.goto("/login");
  if ("email" in who) {
    await page.getByRole("radio", { name: "Equipe" }).click();
    await page.getByLabel("E-mail").fill(who.email);
  } else {
    await page.getByLabel("Matrícula").fill(who.member);
  }
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** An API client logged in as someone (cookies kept), for setup and assertions. */
export async function apiAs(who: Who): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: `${API_URL}/` });
  const response = await api.post("auth/login", {
    data:
      "email" in who
        ? { kind: "staff", email: who.email, password: PASSWORD }
        : { kind: "member", membershipId: who.member, password: PASSWORD },
  });
  if (!response.ok()) throw new Error(`login ${JSON.stringify(who)}: ${response.status()}`);
  return api;
}

export async function getJson<T>(api: APIRequestContext, path: string): Promise<T> {
  const response = await api.get(path);
  expect(response.ok(), `GET ${path} → ${response.status()}`).toBeTruthy();
  return (await response.json()) as T;
}

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
