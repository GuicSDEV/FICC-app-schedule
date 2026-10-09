import { randomBytes } from "node:crypto";

import { validateEnv } from "./env";

const secret = () => randomBytes(32).toString("base64");
const production = (overrides: Record<string, string> = {}) => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db:5432/ficc",
  REDIS_URL: "redis://:pass@redis:6379",
  JWT_ACCESS_SECRET: secret(),
  GUEST_PASS_SECRET: secret(),
  DATA_ENCRYPTION_KEY: secret(),
  ...overrides,
});

describe("validateEnv in production", () => {
  it("accepts real secrets", () => {
    expect(validateEnv(production()).NODE_ENV).toBe("production");
  });

  it("refuses missing secrets", () => {
    const { DATA_ENCRYPTION_KEY: _unused, ...missing } = production();
    expect(() => validateEnv(missing)).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("refuses the .env.example placeholders", () => {
    expect(() =>
      validateEnv(
        production({
          JWT_ACCESS_SECRET: "change-me-to-a-long-random-string-for-access-tokens",
        }),
      ),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("refuses the same secret for tokens and guest passes", () => {
    const shared = secret();
    expect(() =>
      validateEnv(production({ JWT_ACCESS_SECRET: shared, GUEST_PASS_SECRET: shared })),
    ).toThrow(/GUEST_PASS_SECRET/);
  });
});
