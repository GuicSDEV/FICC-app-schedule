import { z } from "zod";

// Local-development defaults mirror docker-compose.yml and .env.example so the API boots even
// before .env exists. Production must set every secret explicitly.
const DEV_DATABASE_URL = "postgresql://ficc:ficc@localhost:5432/ficc?schema=public";
const DEV_SECRET = "dev-only-secret-change-me-in-production-0123456789";
/** 32 zero-ish bytes, base64: fine for local data, never for real guests' documents. */
const DEV_ENCRYPTION_KEY = Buffer.from("dev-only-encryption-key-32-bytes").toString("base64");
const DEV_REDIS_URL = "redis://localhost:6379";

/** AES-256 key: 32 bytes, base64-encoded (`openssl rand -base64 32`). */
const encryptionKey = z.string().refine((value) => Buffer.from(value, "base64").length === 32, {
  message: "Must be 32 bytes encoded as base64 (openssl rand -base64 32)",
});

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
    /** The club this deployment serves (v1 is one club per deployment; see ClubResolver). */
    DEFAULT_CLUB_SLUG: z.string().trim().min(1).default("ficc"),
    /** Redis for the job queue (BullMQ) and the Socket.IO adapter. */
    REDIS_URL: z.url().optional(),
    /** Key prefix of the job queue in Redis (lets several environments share one Redis). */
    QUEUE_PREFIX: z.string().trim().min(1).default("ficc"),
    /** Encrypts guest document numbers at rest (LGPD). */
    DATA_ENCRYPTION_KEY: encryptionKey.optional(),
  })
  .transform((env, ctx) => {
    const production = env.NODE_ENV === "production";
    for (const key of [
      "DATABASE_URL",
      "JWT_ACCESS_SECRET",
      "GUEST_PASS_SECRET",
      "REDIS_URL",
      "DATA_ENCRYPTION_KEY",
    ] as const) {
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
      REDIS_URL: env.REDIS_URL ?? DEV_REDIS_URL,
      DATA_ENCRYPTION_KEY: env.DATA_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
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
