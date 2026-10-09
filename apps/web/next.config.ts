import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Monorepo root (Next runs with apps/web as its working directory).
const workspaceRoot = path.resolve(process.cwd(), "../..");

// Load the shared root .env (apps/web/.env, if present, still takes precedence). Next has already
// loaded apps/web's env by now and @next/env caches that result, so force a reload: otherwise the
// root .env is silently skipped under `pnpm dev`/`pnpm build` and NEXT_PUBLIC_* fall back to defaults.
loadEnvConfig(workspaceRoot, undefined, undefined, true);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingRoot: workspaceRoot,
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
