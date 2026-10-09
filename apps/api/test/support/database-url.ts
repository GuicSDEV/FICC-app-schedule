import { readFileSync } from "node:fs";
import path from "node:path";

const DEV_DATABASE_URL = "postgresql://ficc:ficc@localhost:5432/ficc?schema=public";

function databaseUrlFromEnvFile(): string | undefined {
  try {
    const file = readFileSync(path.resolve(__dirname, "../../../../.env"), "utf8");
    return /^DATABASE_URL=(.+)$/m.exec(file)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

/**
 * The e2e database: DATABASE_URL_TEST, or the development URL with "_test" appended to the
 * database name, so tests never touch development data.
 */
export function testDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const base = new URL(process.env.DATABASE_URL ?? databaseUrlFromEnvFile() ?? DEV_DATABASE_URL);
  const name = base.pathname.replace(/^\//, "") || "ficc";
  base.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return base.toString();
}
