# CLAUDE.md

<!-- Keep in sync with AGENTS.md: both files carry the same content. -->

Private tennis club app: member management, court booking, coach lessons and an Elo ladder.
Mobile-first web app that should feel native and later ship as a PWA or with Capacitor.

> **Always re-read [`docs/SPEC.md`](docs/SPEC.md) and the current phase in
> [`docs/PHASES.md`](docs/PHASES.md) before working; follow the design and motion system exactly.**
>
> Work phase by phase. [`docs/PROGRESS.md`](docs/PROGRESS.md) tracks phase status, decisions,
> known issues and what needs a manual check; update it when a phase is done and commit the phase
> as `feat(phase-N): <summary>`. The spec's DELIVERABLES section is superseded by `docs/PHASES.md`.

> **v1 is FICC-only, but every club-owned model has clubId and goes through the tenant
> extension; club rules live in ClubSettings; sport rules live in SportRules; no hardcoded
> user-facing strings; jobs go through the queue. Don't build multi-club or multi-sport
> features unless asked.**

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Web (`apps/web`):** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui,
  Motion (`motion/react`), vaul, TanStack Query
- **API (`apps/api`):** NestJS 11, Zod-validated config, Socket.IO (Redis adapter) for real
  time, BullMQ + Redis for background jobs
- **Database (`packages/db`):** Prisma 6 + PostgreSQL 17 (Docker), tenant Prisma extension
- **Shared (`packages/shared`):** Zod schemas, DTO types, Elo, SportRules, club settings schema,
  message catalogue (API errors, validation, labels)
- **i18n:** next-intl in the web app (pt-BR only today) fed by its own messages plus the shared
  catalogue
- **Tests:** Vitest (packages), Jest (API)

## Folder structure

```
apps/
  web/                  Next.js app (member, coach, admin and gate areas)
  api/                  NestJS app, one module per domain, routes under /api/v1
packages/
  db/                   prisma/schema.prisma, migrations, seed; exports the Prisma client
  shared/               code shared by web and API (built with tsup to CJS + ESM)
  typescript-config/    tsconfig bases: base, library, node-library, nestjs, nextjs
  eslint-config/        ESLint flat configs: base, next-js, nest-js
docs/SPEC.md            product, design and motion specification (source of truth)
docker-compose.yml      local PostgreSQL and Redis
```

## Conventions

- **Language:** the UI is in Brazilian Portuguese (pt-BR). Code, comments, commit messages and
  logs are in English. Notifications store data; the web app renders the text.
- **No hardcoded user-facing strings.** Web text lives in `apps/web/messages/<locale>.json` and is
  read with next-intl (`useTranslations`, `getTranslations`). API error messages, validation
  messages of shared schemas and enum labels live in `packages/shared/src/i18n` and are referenced
  by key (`unprocessable("CODE", "api.someKey")`, `message: "validation.someKey"`); the API
  translates them into the club's locale. Dates and numbers go through `useFormat()` (club locale
  and time zone), never a hardcoded locale.
- **Tenancy.** Every club-owned table has `clubId`. Services use `PrismaService`, which is the
  tenant-scoped client: it filters and stamps `clubId` automatically from the request's club
  (`tenant()` in `apps/api/src/tenancy`). Never pass `clubId` by hand except in compound unique
  keys, never use `PrismaBaseService` outside the tenancy layer and health checks, and add
  `clubId` filters yourself in raw SQL. Code outside a request (jobs, tests) runs inside
  `runWithTenant()`.
- **Club rules live in `ClubSettings`** (`clubSettingsSchema` in `@ficc/shared`, read with
  `clubSettings()` in the API and `useClub()` in the web). Never hardcode a business number
  (limits, windows, deadlines, Elo K…) or the club's time zone.
- **Sport rules live in `SportRules`** (`sportRules(match.sport)` in `@ficc/shared`; only
  `TennisRules` exists). Never branch on the sport elsewhere.
- **Jobs go through the queue.** Background work is a `CLUB_JOBS` entry in
  `apps/api/src/jobs` (BullMQ + Redis), runs once per club in its tenant context and must be
  idempotent. No `setInterval`/cron decorators.
- **pnpm only.** Add dependencies with `pnpm --filter <package> add <dep>`. Internal packages are
  named `@ficc/*` and referenced as `workspace:*`.
- **TypeScript strict** everywhere (including `noUncheckedIndexedAccess`). Extend the shared
  tsconfig and ESLint packages instead of configuring per app. Prettier lives at the root
  (`pnpm format`).
- **One source of truth for domain logic.** Zod schemas, the Elo function, sport rules and the
  slot helpers live in `packages/shared` and are used by both web and API. Never duplicate them.
- **Database access only through `@ficc/db`.** The Prisma client is generated into
  `packages/db/generated`. Never import `@prisma/client` directly. Schema changes go through
  `pnpm db:migrate`; CHECK constraints live in the migration SQL (see `schema.prisma` comments).
- **Slot collisions:** every PENDING/CONFIRMED booking and SCHEDULED lesson owns one
  `SlotOccupancy` row (primary key court + date + slot), created in the same transaction as the
  booking or lesson and deleted when it is cancelled. Never claim or free a slot any other way.
- **API:** one Nest module per domain (module, controller, service, DTOs), routes under
  `/api/v1`. New environment
  variables go in `apps/api/src/config/env.ts`, `.env.example` and `turbo.json` (`globalEnv`).
  The API keeps runtime class imports (no `import type` for injected classes) because Nest's
  decorator metadata needs them.
- **Web:** Server Components by default; `"use client"` only for interactivity and motion.
  shadcn components live in `components/ui` (`pnpm dlx shadcn@latest add <name>` from
  `apps/web`). Use the `@/` alias and `cn()` from `lib/utils`.
- **Time:** instants are stored as UTC `timestamptz`; calendar days are `@db.Date` columns holding
  the club-local date. Club-local helpers in `@ficc/shared` take the club's zone explicitly
  (`clubToday(now, clubTimeZone())`). Slots come from the club's `TimeSlot` rows (FICC: 75 min).
- **Design and motion:** colors, type and spacing come from the "Night Session" tokens in the
  spec. Durations, easings and springs come only from `apps/web/lib/motion.ts` (no ad-hoc values).
  Animate only `transform` and `opacity`, and honor `prefers-reduced-motion`. Lime (`--ball`) is
  the only accent in the member area; violet (`--lesson`) is the coach accent.
- **Environment:** one root `.env` (copy `.env.example`) read by every app and package. Never
  commit `.env`; only `.env.example` with placeholder values.
- **Personal data (LGPD):** guest document numbers are stored encrypted (`DocumentCryptoService`)
  with a keyed hash for lookups, and anonymized after the club's retention period.
- **Seed:** `pnpm db:seed` wipes every table, creates the FICC club and reloads deterministic data
  (real courts, slots, coaches and lesson template; fictional members and matches) through the
  tenant extension, then runs integrity checks.
- **Before finishing a task**, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
