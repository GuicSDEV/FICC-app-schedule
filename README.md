# FICC Tennis Club

Mobile-first web app for a private tennis club: member management, court booking, coach lessons,
an Elo ladder, tournaments and the club's day-to-day operations (free play, news board, staff
roles). It is installable as a PWA and ready to be wrapped with Capacitor later. The UI is in
Brazilian Portuguese.

| Document                               | What is in it                                              |
| -------------------------------------- | ---------------------------------------------------------- |
| [`docs/SPEC.md`](docs/SPEC.md)         | Product, design ("Night Session") and motion specification |
| [`docs/PHASES.md`](docs/PHASES.md)     | Build phases (11 and 12 are on hold, waiting for the club) |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Phase status, decisions, known issues, what needs a person |
| [`docs/BACKLOG.md`](docs/BACKLOG.md)   | Ideas recorded for later (not implemented)                 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md)     | Railway deploy: demo and production (in Portuguese)        |
| [`SECURITY.md`](SECURITY.md)           | Security audit, production secrets, checks to run          |

## What the app does

- **Members** (`/app`): dashboard with their Elo, bookings and invitations; court calendar with
  live updates, booking with partners (a tapped court is kept for the member while they pick a
  partner; others wait in line and get it if they give up), "Procuro parceiro" requests for members
  with nobody to play with, favourite slots and the booking-opening countdown; "Courts
  now" for free-play days (check-in, digital queue); match reports with opponent approval and Elo;
  ranking (with a member search), head-to-head and profiles; guest passes with QR; tournaments and circuits; the club's
  news board ("Mural").
- **Coaches** (`/coach`): their agenda, swipe to cancel a lesson (one day or the series) with undo,
  the courts calendar.
- **Staff** (`/admin`): rain/maintenance freezes, bookings and no-shows, free-play courts, news,
  members (sign-up approvals, matrícula import, no-show history), coaches and lessons,
  tournaments, result disputes, guests, the club's rules and date exceptions, staff accounts with
  roles and permissions, and the audit log of every staff action.
- **Gate** (`/gate`): QR scanning of guest passes, document lookup, history.
- **Public** (`/t/<publicId>`): read-only tournament page, share image and printable draw.

## Requirements

- Node.js 20.19 or newer (22 recommended, see `.nvmrc`)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)
- Docker with Compose v2 (for PostgreSQL and Redis)

## Run it locally

```bash
corepack enable           # once per machine
pnpm install
cp .env.example .env      # local defaults that match docker-compose.yml
docker compose up -d      # PostgreSQL on localhost:5432, Redis on localhost:6379
pnpm db:migrate           # apply Prisma migrations
pnpm db:seed              # load seed data (wipes the database first)
pnpm dev                  # web + API in watch mode
```

| Service    | URL                                 |
| ---------- | ----------------------------------- |
| Web        | http://localhost:3000               |
| API        | http://localhost:4000/api/v1        |
| API health | http://localhost:4000/api/v1/health |

Open http://localhost:3000 on a phone-sized window (or your phone on the same network, with
`NEXT_PUBLIC_API_URL` and `WEB_ORIGIN` pointing to your machine's address) and log in with one of
the accounts below.

For a production-like run: `pnpm build && pnpm start`. The service worker (offline support) is
only registered in production builds.

## Test accounts (seed)

Every seeded account uses the password `ficc1234` (or `SEED_PASSWORD`). Members log in with
their matrícula, staff and coaches with their email.

| Account            | Login                  | Area     | Roles / notes                                           |
| ------------------ | ---------------------- | -------- | ------------------------------------------------------- |
| Rafael Almeida     | `104218`               | `/app`   | Member, top of the ladder (30 members in total)         |
| Administração FICC | `admin@ficc.test`      | `/admin` | Super admin (everything, including roles)               |
| Diretoria FICC     | `diretoria@ficc.test`  | `/admin` | Diretoria (everything except platform/roles)            |
| Secretaria FICC    | `secretaria@ficc.test` | `/admin` | Secretaria (bookings, courts, Mural, approvals, guests) |
| Portaria FICC      | `portaria@ficc.test`   | `/gate`  | Gate                                                    |
| Alan               | `alan@ficc.test`       | `/coach` | Coach (Q5), role Professor                              |
| Phelipe            | `phelipe@ficc.test`    | `/coach` | Coach (Q6), role Professor                              |
| Professor do Clube | `professor@ficc.test`  | `/coach` | Coach (Q1, Q6), role Professor                          |

Also in the seed: matrícula `114650` (Ana Paula Moura) has signed up and waits for approval; nine
more unused matrículas (`115083`, `115417`…) can be used to try the sign-up. FICC's real setup:
courts Q1–Q4 (Har-Tru) and Q5–Q6 (Saibro); weekdays have 8 slots of 75 min (08:30–21:00),
weekends 7 (07:15–17:15); Saturday is a free-play day; bookings for a day open at 07:00 the day
before; the coaches' weekly lessons for the next 8 weeks; 40 past matches with a consistent Elo
history; a circuit with an open tournament and a draft; three news posts; a date exception closing
Q5/Q6 for maintenance.

## Roles and permissions

Accounts have one type (member, coach, staff, gate) that decides the area. Staff (and coaches) can
also hold **roles**, editable at `/admin/staff` by whoever has the platform permission; a person's
permissions are the union of their roles' permissions, and the admin menu only shows what they
may open. The API checks every permission on every request; the web only hides what is not
allowed.

| Permission           | Gives access to                                        |
| -------------------- | ------------------------------------------------------ |
| `BOOKINGS_MANAGE`    | Any booking, staff cancellation, no-shows              |
| `COURTS_MANAGE`      | Freezes (rain/maintenance), date exceptions, free play |
| `NEWS_MANAGE`        | The Mural                                              |
| `MEMBERS_APPROVE`    | Sign-up approvals                                      |
| `MEMBERS_MANAGE`     | Member list, matrícula CSV import                      |
| `GUESTS_MANAGE`      | Guest passes, blocked documents, hosts                 |
| `LESSONS_MANAGE`     | Coaches and every lesson                               |
| `TOURNAMENTS_MANAGE` | Tournaments and circuits                               |
| `RANKING_MANAGE`     | Result disputes                                        |
| `SETTINGS_MANAGE`    | The club's rules (`ClubSettings`)                      |
| `STAFF_MANAGE`       | Staff accounts and the audit log                       |
| `PLATFORM_MANAGE`    | Roles and their permissions                            |

## Scripts

Run from the repo root.

| Script                   | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `pnpm dev`               | Start every app in watch mode                                          |
| `pnpm build`             | Production build of all packages and apps                              |
| `pnpm start`             | Run the production builds (web on 3000, API on 4000)                   |
| `pnpm lint`              | ESLint across the workspace                                            |
| `pnpm typecheck`         | TypeScript checks across the workspace                                 |
| `pnpm test`              | Unit tests (Vitest in packages, Jest in the API)                       |
| `pnpm test:e2e`          | API end-to-end tests (Jest + Supertest on a separate `_test` database) |
| `pnpm test:browser`      | Browser journeys with Playwright (see below; reseeds the database)     |
| `pnpm format`            | Format everything with Prettier (`format:check` to verify)             |
| `pnpm db:migrate`        | Create and apply a migration in development (`prisma migrate dev`)     |
| `pnpm db:migrate:deploy` | Apply pending migrations (CI/production)                               |
| `pnpm db:seed`           | Wipe the database and load the seed                                    |
| `pnpm db:generate`       | Regenerate the Prisma client                                           |
| `pnpm db:studio`         | Open Prisma Studio                                                     |

To run a script in one package only: `pnpm --filter @ficc/api test`.

## Testing

- **Unit** (`pnpm test`): Elo, sport rules and scoring, slot and day-plan helpers, tournament
  algorithms, schemas and the message catalogue in `@ficc/shared`; API units with Jest.
- **API end to end** (`pnpm test:e2e`): every module through HTTP against a real PostgreSQL
  (database `DATABASE_URL_TEST`, or the dev database name with `_test` appended, created and
  migrated automatically), including concurrency (two members on one slot, 150 simultaneous
  booking attempts at opening time, simultaneous taps on one court) and tenant isolation.
- **Browser journeys** (`pnpm test:browser`, Playwright in `apps/web/e2e`): login for each role,
  booking with a partner, a coach cancelling a lesson and a member booking the freed slot,
  reporting a match → opponent approval → Elo, a court kept on tap handed to the member waiting
  for it, a partner request answered with a booking, the ranking search, and the gate scanning a guest pass QR through a
  fake camera. They run against the production builds and **reseed the development database**:

  ```bash
  docker compose up -d && pnpm build
  pnpm --filter @ficc/web exec playwright install chromium   # once
  pnpm test:browser          # starts the API and web if they are not running
  ```

  `E2E_BASE_URL` / `E2E_API_URL` point the tests elsewhere, `E2E_SKIP_SEED=1` skips the reseed and
  `PLAYWRIGHT_CHROMIUM_PATH` uses an already installed Chromium.

Before finishing any change: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Architecture

```
apps/web  (Next.js 15, React 19)           apps/api  (NestJS 11)                 packages/db
 ├ app/(auth)  login, sign-up               ├ one module per domain, /api/v1       Prisma 6 + PostgreSQL 17
 ├ app/app     member area                  ├ tenancy: club per request,           tenant extension adds
 ├ app/coach   coach area                   │  Prisma client scoped to the club     clubId to every query
 ├ app/admin   staff area (permissions)     ├ Socket.IO (Redis adapter): live      migrations + seed
 ├ app/gate    gate                         │  calendar, ranking, notifications
 ├ app/t       public tournament pages      ├ BullMQ jobs (Redis), once per club    packages/shared
 ├ TanStack Query + Socket.IO client        └ guards: auth, roles, permissions,    Zod schemas, DTO types,
 └ next-intl (pt-BR), Motion, vaul             rate limit; audit interceptor        Elo, SportRules, slots,
                                                                                    day plans, i18n catalogue
```

- **One club per deployment (v1), multi-club ready.** Every club-owned table has `clubId`; the
  API's Prisma client goes through a tenant extension that scopes every query to the current club
  (resolved from `DEFAULT_CLUB_SLUG`). Club rules (booking window and opening, limits, Elo K,
  free play, approvals, penalties, slot grids per weekday…) live in `ClubSettings` and are edited
  at `/admin/settings`; sport rules (sets, scoring) in `SportRules`.
- **Slots never collide:** every pending/confirmed booking, scheduled lesson and tournament match
  owns one `SlotOccupancy` row (court + date + slot primary key), created in the same transaction.
- **Text:** every user-facing string comes from a catalogue: `packages/shared/src/i18n/pt-BR.ts`
  (API messages, validation, labels) and `apps/web/messages/pt-BR.json` (screens), via next-intl.
  Dates and numbers use the club's locale and time zone; the server clock is the only clock for
  countdowns.
- **Rendering:** member, coach and gate pages render on the server (the shell from the role
  cookie, the first data of the dashboard, calendar and ranking prefetched with the user's
  cookies) and hydrate into TanStack Query; later updates arrive over Socket.IO.
- **Background jobs** (booking expiry, match auto-approval, lesson generation, freeze
  announcements, free-play check-out and queue offers, LGPD retention) run on BullMQ, once per
  active club, and are idempotent.
- **LGPD:** guest document numbers are encrypted at rest (AES-256-GCM) with a keyed hash for
  lookups, and guest personal data is anonymized after the club's retention period.

## PWA and native apps

- **Installable:** `app/manifest.ts` (name from the club, standalone, start on `/app`, shortcuts
  to booking, "Courts now" and ranking), icons in `public/icons` (any + maskable, Apple touch
  icon). Members see an "Instale o app" card (Android/desktop install prompt, or the share-sheet
  steps on iPhone) on the dashboard and in the profile.
- **Offline:** `public/sw.js` caches the app shell (pages: network first, last good copy when
  offline, `/offline` otherwise), build assets (cache first) and API reads (network first, last
  answer when offline). Writes always need the network. An "Você está offline" banner explains
  it. Logging out drops the cached API answers.
- **Capacitor (later, Phase 12, on hold):** the plan is a Capacitor shell per store with the web
  app's static shell bundled and the API called remotely.
  1. `pnpm --filter @ficc/web add @capacitor/core @capacitor/cli` and `npx cap init` in `apps/web`
     (app id per club, e.g. `br.com.ficc.tenis`).
  2. Point Capacitor at the production web URL first (`server.url`), then move to a bundled
     static shell once the member area has no server-only pages.
  3. Use `viewport-fit=cover` and the existing `env(safe-area-inset-*)` paddings (already in the
     layout) for the notch and home indicator; status bar and splash from the same "Night Session"
     colours (`#0B0F0D`).
  4. Native features to wire through the existing seams: push as a new `NotificationChannel`
     (FCM/APNs device tokens), the camera plugin for the gate scanner, haptics behind `haptic()`
     in `lib/motion.ts`, the native share sheet behind the guest-pass share, deep links for
     `/t/<publicId>` and guest passes.
  5. Cookies: the API sets `SameSite=Lax` cookies for the web origin; a native shell on another origin
     needs `COOKIE_DOMAIN`/CORS for it or a token header.

## Environment variables

All apps read the single root `.env` (copy `.env.example`). Never commit `.env`; only
`.env.example`, with placeholder values, belongs in the repo.

| Variable                            | Used by       | Purpose                                                    |
| ----------------------------------- | ------------- | ---------------------------------------------------------- |
| `POSTGRES_*`, `REDIS_PORT`          | Docker        | Database user, password, name and host ports               |
| `DATABASE_URL`                      | db, API       | PostgreSQL connection string for Prisma                    |
| `DATABASE_URL_TEST`                 | API e2e       | Database for `pnpm test:e2e` (default: dev name + `_test`) |
| `REDIS_URL`                         | API           | Redis for the job queue and the Socket.IO adapter          |
| `QUEUE_PREFIX`                      | API           | Key prefix of the job queue (default `ficc`)               |
| `JOBS_ENABLED`                      | API           | Run background jobs on BullMQ (default `true`)             |
| `API_PORT`                          | API           | Port the API listens on (default 4000)                     |
| `WEB_ORIGIN`                        | API           | Origin allowed by CORS (default `http://localhost:3000`)   |
| `DEFAULT_CLUB_SLUG`                 | API           | Club this deployment serves (default `ficc`)               |
| `JWT_ACCESS_SECRET`                 | API           | Signs access tokens (production: required)                 |
| `GUEST_PASS_SECRET`                 | API           | Signs guest QR codes (production: required)                |
| `DATA_ENCRYPTION_KEY`               | API           | Key for guest documents at rest (production: required)     |
| `ACCESS_TOKEN_TTL_MINUTES`          | API           | Access cookie lifetime (default 15)                        |
| `REFRESH_TOKEN_TTL_DAYS`            | API           | Refresh cookie lifetime (default 30)                       |
| `COOKIE_DOMAIN`                     | API           | Cookie domain when web and API use different subdomains    |
| `COOKIE_SECURE`                     | API           | Secure cookies (default: on in production)                 |
| `NEXT_PUBLIC_API_URL`               | Web           | Base URL of the API (default `http://localhost:4000`)      |
| `SEED_PASSWORD`                     | seed          | Password for every seeded account (default `ficc1234`)     |
| `E2E_*`, `PLAYWRIGHT_CHROMIUM_PATH` | browser tests | See "Testing"                                              |

In development the API and web fall back to defaults when `.env` is missing; the `db:*` scripts
need `.env`. Generate production secrets with `openssl rand -base64 32` (one per variable). Keep
`DATA_ENCRYPTION_KEY` safe: losing it makes the stored guest documents unreadable.

## Project structure

```
apps/
  web/                  Next.js app (member, coach, admin, gate and public pages), e2e/ Playwright
  api/                  NestJS app, one module per domain, test/ API e2e
packages/
  db/                   Prisma schema, migrations and seed; exports the Prisma client
  shared/               Zod schemas, DTOs, Elo, sport rules, day plans, i18n catalogue
  typescript-config/    Shared tsconfig bases
  eslint-config/        Shared ESLint flat configs
docs/                   Spec, phases, progress, backlog
docker-compose.yml      Local PostgreSQL and Redis
```

## Troubleshooting

- **Port 5432 already in use:** set `POSTGRES_PORT=5433` in `.env`, update the port in
  `DATABASE_URL` to match, then run `docker compose up -d` again.
- **Redis not running:** the API logs Redis warnings, background jobs do not run and live updates
  only reach clients of the same API process. Start it with `docker compose up -d redis`.
- **Reset the database:** `docker compose down -v` deletes the data volume. Then run
  `docker compose up -d && pnpm db:migrate && pnpm db:seed`.
- **Stale screens after a deploy:** the service worker updates itself on the next visit; to force
  it, close every tab of the app (or "Update on reload" in the browser's devtools).
- **Adding shadcn/ui components:** from `apps/web`, run `pnpm dlx shadcn@latest add <component>`.
- **Prisma client:** it is generated into `packages/db/generated` (git-ignored) on build, on
  `pnpm db:generate` and after each migration. Import it only from `@ficc/db`.
