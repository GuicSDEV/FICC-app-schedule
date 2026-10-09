# FICC Tennis Club

Mobile-first web app for a private tennis club: member management, court booking, coach lesson
management and a competitive Elo ladder. The full product, design and motion specification is in
[`docs/SPEC.md`](docs/SPEC.md).

## Requirements

- Node.js 20.19 or newer (22 recommended, see `.nvmrc`)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)
- Docker with Compose v2 (for PostgreSQL and Redis)

## Setup

```bash
corepack enable           # once per machine
pnpm install
cp .env.example .env      # local defaults that match docker-compose.yml
docker compose up -d      # PostgreSQL on localhost:5432, Redis on localhost:6379
pnpm db:migrate           # apply Prisma migrations
pnpm db:seed              # load seed data
pnpm dev                  # web + API in watch mode
```

| Service    | URL                                 |
| ---------- | ----------------------------------- |
| Web        | http://localhost:3000               |
| API        | http://localhost:4000/api/v1        |
| API health | http://localhost:4000/api/v1/health |

`pnpm dev` builds the internal packages first, then runs the Next.js dev server, the NestJS API
and the `@ficc/shared` watcher together. The home page shows whether the API and the database
are reachable.

## Scripts

Run from the repo root.

| Script                   | What it does                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| `pnpm dev`               | Start every app in watch mode                                      |
| `pnpm build`             | Production build of all packages and apps                          |
| `pnpm start`             | Run the production builds (web on 3000, API on 4000)               |
| `pnpm lint`              | ESLint across the workspace                                        |
| `pnpm typecheck`         | TypeScript checks across the workspace                             |
| `pnpm test`              | Unit tests (Vitest in packages, Jest in the API)                   |
| `pnpm format`            | Format everything with Prettier (`format:check` to verify)         |
| `pnpm db:migrate`        | Create and apply a migration in development (`prisma migrate dev`) |
| `pnpm db:migrate:deploy` | Apply pending migrations (CI/production)                           |
| `pnpm db:seed`           | Run `packages/db/prisma/seed.ts`                                   |
| `pnpm db:generate`       | Regenerate the Prisma client                                       |
| `pnpm db:studio`         | Open Prisma Studio                                                 |

To run a script in one package only: `pnpm --filter @ficc/api test`.

## Seed data

`pnpm db:seed` wipes every table and loads deterministic development data, dated relative to
today (club time), then prints a summary and integrity checks:

- **Real club setup:** the club FICC (slug `ficc`) with its settings and categories, courts
  Q1–Q4 (Har-Tru) and Q5–Q6 (Saibro), the 8 slots of 75 minutes, coaches Alan (Q5), Phelipe (Q6)
  and Professor do Clube (Q1, Q6), and the weekday lesson template from the spec as lesson series
  with occurrences for the next 8 weeks.
- **Fictional data:** 30 members across categories, 10 unused membership IDs for trying sign-up,
  and 40 confirmed matches over the last four months with consistent Elo history.
- **Tournaments:** the "Circuito FICC" circuit with its stage "Aberto de Primavera FICC"
  (registration open, Simples A with 11 entries — Rafael is left out so registering can be tried —
  and Duplas in groups) and a draft "Torneio de Inverno". Public pages live at `/t/<publicId>`.

Every seeded account uses the password `ficc1234` (or `SEED_PASSWORD`). Members log in with
their matrícula (for example `104218`, Rafael Almeida); staff and coaches with their email:

| Account            | Login                 | Role  |
| ------------------ | --------------------- | ----- |
| Administração FICC | `admin@ficc.test`     | ADMIN |
| Portaria FICC      | `portaria@ficc.test`  | GATE  |
| Alan               | `alan@ficc.test`      | COACH |
| Phelipe            | `phelipe@ficc.test`   | COACH |
| Professor do Clube | `professor@ficc.test` | COACH |

## Project structure

```
apps/
  web/                  Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui
  api/                  NestJS 11, routes under /api/v1
packages/
  db/                   Prisma schema, migrations and seed; exports the Prisma client
  shared/               Zod schemas, Elo, sport rules, i18n catalogue, dates (web and API)
  typescript-config/    Shared tsconfig bases
  eslint-config/        Shared ESLint flat configs
docs/SPEC.md            Product, design and motion specification
docker-compose.yml      Local PostgreSQL and Redis
```

## Environment variables

All apps read the single root `.env`. See `.env.example` for the full list.

| Variable              | Used by | Purpose                                                  |
| --------------------- | ------- | -------------------------------------------------------- |
| `POSTGRES_*`          | Docker  | Database user, password, name and host port              |
| `DATABASE_URL`        | db, API | PostgreSQL connection string for Prisma                  |
| `API_PORT`            | API     | Port the API listens on (default 4000)                   |
| `WEB_ORIGIN`          | API     | Origin allowed by CORS (default `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Web     | Base URL of the API (default `http://localhost:4000`)    |
| `SEED_PASSWORD`       | db seed | Password for every seeded account (default `ficc1234`)   |
| `REDIS_URL`           | API     | Redis for the job queue and the Socket.IO adapter        |
| `QUEUE_PREFIX`        | API     | Key prefix of the job queue (default `ficc`)             |
| `JOBS_ENABLED`        | API     | Run background jobs on BullMQ (default `true`)           |
| `DEFAULT_CLUB_SLUG`   | API     | Club this deployment serves (default `ficc`)             |
| `DATA_ENCRYPTION_KEY` | API     | Key for guest documents at rest (production: required)   |
| `JWT_ACCESS_SECRET`   | API     | Signs access tokens (production: required)               |
| `GUEST_PASS_SECRET`   | API     | Signs guest QR codes (production: required)              |

In development the API and web fall back to these defaults when `.env` is missing, so
`pnpm dev` works out of the box. The `db:*` scripts need `.env`.

Generate production secrets with `openssl rand -base64 32` (one per variable). Keep
`DATA_ENCRYPTION_KEY` safe: losing it makes the stored guest documents unreadable. `.env` is
git-ignored; never commit it. Only `.env.example`, with placeholder values, belongs in the repo.

## Architecture notes

- **One club per deployment (v1), multi-club ready.** Every club-owned table has `clubId`, and the
  API's Prisma client goes through a tenant extension that scopes every query to the current
  club (resolved from `DEFAULT_CLUB_SLUG`). Club rules (booking window, Elo K-factor, retention
  days…) live in `ClubSettings`; sport rules (sets, scoring) in `SportRules`.
- **Text:** every user-facing string comes from a catalogue: `packages/shared/src/i18n/pt-BR.ts`
  (API messages, validation, labels) and `apps/web/messages/pt-BR.json` (screens), via next-intl.
  Dates and numbers are formatted with the club's locale and time zone.
- **Background jobs** (booking expiry, match auto-approval, lesson generation, freeze
  announcements, LGPD retention) run on BullMQ (Redis), once per active club, and are idempotent.
- **LGPD:** guest document numbers are encrypted at rest (AES-256-GCM) and guest personal data is
  anonymized after `guestDataRetentionDays` (90 by default).

## Troubleshooting

- **Port 5432 already in use:** set `POSTGRES_PORT=5433` in `.env`, update the port in
  `DATABASE_URL` to match, then run `docker compose up -d` again.
- **Redis not running:** the API logs Redis warnings, background jobs do not run and live updates
  only reach clients of the same API process. Start it with `docker compose up -d redis`.
- **Reset the database:** `docker compose down -v` deletes the data volume. Then run
  `docker compose up -d && pnpm db:migrate && pnpm db:seed`.
- **Adding shadcn/ui components:** from `apps/web`, run `pnpm dlx shadcn@latest add <component>`.
- **Prisma client:** it is generated into `packages/db/generated` (git-ignored) on build, on
  `pnpm db:generate` and after each migration. Import it only from `@ficc/db`.
