import { z } from "zod";

// Local-development defaults mirror docker-compose.yml and .env.example so the API boots even
// before .env exists. Production must set every secret explicitly.
const DEV_DATABASE_URL = "postgresql://ficc:ficc@localhost:5432/ficc?schema=public";
const DEV_SECRET = "dev-only-secret-change-me-in-production-0123456789";

const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.url().optional(),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    GUEST_PASS_SECRET: z.string().min(32).optional(),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** e.g. ".club.com.br" when web and API live on sibling subdomains. */
    COOKIE_DOMAIN: z.string().min(1).optional(),
    COOKIE_SECURE: booleanFlag.optional(),
    /** Scheduled jobs (booking expiry, series generation, auto-approve). Off in tests. */
    JOBS_ENABLED: booleanFlag.default(true),
  })
  .transform((env, ctx) => {
    const production = env.NODE_ENV === "production";
    for (const key of ["DATABASE_URL", "JWT_ACCESS_SECRET", "GUEST_PASS_SECRET"] as const) {
      if (production && !env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: "Required in production" });
      }
    }
    if (ctx.issues.length > 0) return z.NEVER;
    return {
      ...env,
      DATABASE_URL: env.DATABASE_URL ?? DEV_DATABASE_URL,
      JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? DEV_SECRET,
      GUEST_PASS_SECRET: env.GUEST_PASS_SECRET ?? `${DEV_SECRET}-guest`,
      COOKIE_SECURE: env.COOKIE_SECURE ?? production,
    };
  });

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fails fast with a readable message on bad config. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
