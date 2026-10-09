import { z } from "zod";

// Local-development defaults mirror docker-compose.yml and .env.example so the
// API boots even before .env exists. Production must set every value.
const DEV_DATABASE_URL = "postgresql://ficc:ficc@localhost:5432/ficc?schema=public";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.url().optional(),
  })
  .transform((env, ctx) => {
    if (env.DATABASE_URL) return { ...env, DATABASE_URL: env.DATABASE_URL };
    if (env.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Required in production" });
      return z.NEVER;
    }
    return { ...env, DATABASE_URL: DEV_DATABASE_URL };
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
