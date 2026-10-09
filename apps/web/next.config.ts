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

// Production: the browser calls the API and its socket through this app (same origin), so the login
// cookies work whatever the hosts are. API_INTERNAL_URL is the API's private address (read at build).
const apiInternalUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingRoot: workspaceRoot,
  // The Docker image runs the self-contained server (`node apps/web/server.js`).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // socket.io paths end in "/" (e.g. /socket.io/?EIO=4): never redirect them.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    if (!apiInternalUrl) return [];
    return [
      { source: "/api/v1/:path*", destination: `${apiInternalUrl}/api/v1/:path*` },
      // Exact "/socket.io/" first: the wildcard rule would drop the trailing slash socket.io needs.
      { source: "/socket.io/", destination: `${apiInternalUrl}/socket.io/` },
      { source: "/socket.io/:path*", destination: `${apiInternalUrl}/socket.io/:path*` },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
