# Progress

Status of each phase in [`PHASES.md`](PHASES.md), the decisions taken along the way, known issues
and what still needs a human to check.

## Phase status

| Phase | Title                                 | Status      | Commit    |
| ----- | ------------------------------------- | ----------- | --------- |
| 0     | Monorepo setup                        | Done        | `9128b7f` |
| 1     | Database                              | Done        | `9501ffb` |
| 2     | Shared package                        | Not started |           |
| 3     | API core: auth, schedule, bookings    | Not started |           |
| 4     | API: coaches, lessons, maintenance    | Not started |           |
| 5     | API: matches, Elo, ranking, guests    | Not started |           |
| 6     | Frontend foundation (design + motion) | Not started |           |
| 7     | Member: dashboard, calendar, booking  | Not started |           |
| 8     | Member: matches, ranking, H2H, guests | Not started |           |
| 9     | Coach, gate, admin screens            | Not started |           |
| 10    | PWA, polish, QA                       | Not started |           |

## Decisions

- **UI language is Brazilian Portuguese (pt-BR).** Code, comments, commit messages and logs are in
  English. API error messages are user-facing, so they are pt-BR too.
- **"Club Coach" is seeded as "Professor do Clube"** to fit the pt-BR UI (one line in
  `packages/db/prisma/seed/data.ts`; admins can rename it).
- **Slot collisions:** one `SlotOccupancy` table keyed by court + date + slot. Every
  PENDING/CONFIRMED booking and SCHEDULED lesson claims its row in the same transaction; cancelling
  deletes it. Rules the key cannot express (player in two bookings at once, max 2 active bookings,
  coach teaching twice at once) are checked in serializable transactions in the API.
- **Extra models:** `RefreshToken` (rotating refresh tokens) and `CourtFreezeCourt` (one freeze
  event covers one court, a surface or all courts).
- **CHECK constraints** that Prisma cannot express live in the migration SQL; Prisma ignores them
  when diffing, so later migrations keep them.
- **Calendar dates** are `@db.Date` columns holding the club-local date (America/Sao_Paulo);
  instants are `timestamptz`.
- **The seed wipes every table** and loads deterministic data dated relative to today. It refuses
  to run with `NODE_ENV=production`. Every seeded account's password is `ficc1234`
  (`SEED_PASSWORD`).
- **Membership IDs (matrícula)** are stored digits-only; formatting is a UI concern.
- **Staff log in with email**, members with their matrícula.
- **shadcn/ui was initialized by hand** because the sandbox blocks `ui.shadcn.com`; the files
  match what the CLI generates.

## Known issues

- None open.

## Needs manual check

- Nothing yet.
