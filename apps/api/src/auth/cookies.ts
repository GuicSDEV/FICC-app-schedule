import type { CookieOptions, Response } from "express";

import type { Env } from "../config/env";

export const ACCESS_COOKIE = "ficc_at";
export const REFRESH_COOKIE = "ficc_rt";
/** Non-sensitive hint (the role) so the web app can route before calling the API. */
export const ROLE_COOKIE = "ficc_role";
/** Refresh cookies only travel to the auth endpoints. */
export const REFRESH_COOKIE_PATH = "/api/auth";

type CookieEnv = Pick<
  Env,
  "COOKIE_DOMAIN" | "COOKIE_SECURE" | "ACCESS_TOKEN_TTL_MINUTES" | "REFRESH_TOKEN_TTL_DAYS"
>;

function base(env: CookieEnv): CookieOptions {
  return {
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(
  response: Response,
  env: CookieEnv,
  tokens: { accessToken: string; refreshToken: string; role: string },
): void {
  const refreshMaxAge = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(env),
    httpOnly: true,
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(env),
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshMaxAge,
  });
  response.cookie(ROLE_COOKIE, tokens.role, {
    ...base(env),
    httpOnly: false,
    path: "/",
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(response: Response, env: CookieEnv): void {
  response.clearCookie(ACCESS_COOKIE, { ...base(env), path: "/" });
  response.clearCookie(REFRESH_COOKIE, { ...base(env), path: REFRESH_COOKIE_PATH });
  response.clearCookie(ROLE_COOKIE, { ...base(env), path: "/" });
}
