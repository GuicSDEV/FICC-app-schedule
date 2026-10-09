# AGENTS.md

<!-- Keep in sync with CLAUDE.md: both files carry the same content. -->

Private tennis club app: member management, court booking, coach lessons and an Elo ladder.
Mobile-first web app that should feel native and later ship as a PWA or with Capacitor.

> **Always read [`docs/SPEC.md`](docs/SPEC.md) before any task; follow the design and motion system exactly.**
>
> Delivery is phased. Each phase arrives as its own request: do only that phase. The spec's
> DELIVERABLES section is superseded by those requests.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Web (`apps/web`):** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui,
  Motion (`motion/react`), vaul, TanStack Query
- **API (`apps/api`):** NestJS 11, Zod-validated config, Socket.IO for real time
- **Database (`packages/db`):** Prisma 6 + PostgreSQL 17 (Docker)
- **Shared (`packages/shared`):** Zod schemas, DTO types, Elo, score validation, slot grid
- **Tests:** Vitest (packages), Jest (API)

## Folder structure

```
apps/
  web/                  Next.js app (member, coach, admin and gate areas)
  api/                  NestJS app, one module per domain, routes under /api
packages/
  db/                   prisma/schema.prisma, migrations, seed; exports the Prisma client
  shared/               code shared by web and API (built with tsup to CJS + ESM)
  typescript-config/    tsconfig bases: base, library, node-library, nestjs, nextjs
  eslint-config/        ESLint flat configs: base, next-js, nest-js
docs/SPEC.md            product, design and motion specification (source of truth)
docker-compose.yml      local PostgreSQL
```

## Conventions

- **pnpm only.** Add dependencies with `pnpm --filter <package> add <dep>`. Internal packages are
  named `@ficc/*` and referenced as `workspace:*`.
- **TypeScript strict** everywhere (including `noUncheckedIndexedAccess`). Extend the shared
  tsconfig and ESLint packages instead of configuring per app. Prettier lives at the root
  (`pnpm format`).
- **One source of truth for domain logic.** Zod schemas, the Elo function, score validation and
  the slot grid live in `packages/shared` and are used by both web and API. Never duplicate them.
- **Database access only through `@ficc/db`.** The Prisma client is generated into
  `packages/db/generated`. Never import `@prisma/client` directly. Slot collisions are enforced
  by a DB unique constraint shared by bookings and lessons, inside a transaction.
- **API:** one Nest module per domain (module, controller, service, DTOs). New environment
  variables go in `apps/api/src/config/env.ts`, `.env.example` and `turbo.json` (`globalEnv`).
  The API keeps runtime class imports (no `import type` for injected classes) because Nest's
  decorator metadata needs them.
- **Web:** Server Components by default; `"use client"` only for interactivity and motion.
  shadcn components live in `components/ui` (`pnpm dlx shadcn@latest add <name>` from
  `apps/web`). Use the `@/` alias and `cn()` from `lib/utils`.
- **Time:** store UTC; compute and display in `America/Sao_Paulo` (`CLUB_TIMEZONE` from
  `@ficc/shared`) with `date-fns-tz`. Slots are the fixed 75-minute grid, never hourly.
- **Design and motion:** colors, type and spacing come from the "Night Session" tokens in the
  spec. Durations, easings and springs come only from `apps/web/lib/motion.ts` (no ad-hoc values).
  Animate only `transform` and `opacity`, and honor `prefers-reduced-motion`. Lime (`--ball`) is
  the only accent in the member area; violet (`--lesson`) is the coach accent.
- **Environment:** one root `.env` (copy `.env.example`) read by every app and package.
- **Before finishing a task**, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
