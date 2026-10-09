# FICC Tennis Club

Mobile-first web app for a private tennis club: member management, court booking, coach lesson
management and a competitive Elo ladder. The full product, design and motion specification is in
[`docs/SPEC.md`](docs/SPEC.md).

## Requirements

- Node.js 20.19 or newer (22 recommended, see `.nvmrc`)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)
- Docker with Compose v2 (for PostgreSQL)

## Setup

```bash
corepack enable           # once per machine
pnpm install
cp .env.example .env      # local defaults that match docker-compose.yml
docker compose up -d      # PostgreSQL on localhost:5432
pnpm db:migrate           # apply Prisma migrations
pnpm db:seed              # load seed data
pnpm dev                  # web + API in watch mode
```

| Service    | URL                              |
| ---------- | -------------------------------- |
| Web        | http://localhost:3000            |
| API        | http://localhost:4000/api        |
| API health | http://localhost:4000/api/health |

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

## Project structure

```
apps/
  web/                  Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui
  api/                  NestJS 11, routes under /api
packages/
  db/                   Prisma schema, migrations and seed; exports the Prisma client
  shared/               Zod schemas, Elo, score validation, slot grid (used by web and API)
  typescript-config/    Shared tsconfig bases
  eslint-config/        Shared ESLint flat configs
docs/SPEC.md            Product, design and motion specification
docker-compose.yml      Local PostgreSQL
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

In development the API and web fall back to these defaults when `.env` is missing, so
`pnpm dev` works out of the box. The `db:*` scripts need `.env`.

## Troubleshooting

- **Port 5432 already in use:** set `POSTGRES_PORT=5433` in `.env`, update the port in
  `DATABASE_URL` to match, then run `docker compose up -d` again.
- **Reset the database:** `docker compose down -v` deletes the data volume. Then run
  `docker compose up -d && pnpm db:migrate && pnpm db:seed`.
- **Adding shadcn/ui components:** from `apps/web`, run `pnpm dlx shadcn@latest add <component>`.
- **Prisma client:** it is generated into `packages/db/generated` (git-ignored) on build, on
  `pnpm db:generate` and after each migration. Import it only from `@ficc/db`.
