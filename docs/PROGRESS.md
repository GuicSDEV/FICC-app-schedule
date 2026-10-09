# Progress

Status of each phase in [`PHASES.md`](PHASES.md), the decisions taken along the way, known issues
and what still needs a human to check.

## Phase status

| Phase | Title                                 | Status      | Commit          |
| ----- | ------------------------------------- | ----------- | --------------- |
| 0     | Monorepo setup                        | Done        | `9128b7f`       |
| 1     | Database                              | Done        | `9501ffb`       |
| 2     | Shared package                        | Done        | `feat(phase-2)` |
| 3     | API core: auth, schedule, bookings    | Not started |                 |
| 4     | API: coaches, lessons, maintenance    | Not started |                 |
| 5     | API: matches, Elo, ranking, guests    | Not started |                 |
| 6     | Frontend foundation (design + motion) | Not started |                 |
| 7     | Member: dashboard, calendar, booking  | Not started |                 |
| 8     | Member: matches, ranking, H2H, guests | Not started |                 |
| 9     | Coach, gate, admin screens            | Not started |                 |
| 10    | PWA, polish, QA                       | Not started |                 |

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
- **Shared DTOs:** request bodies are Zod schemas in `packages/shared/src/schemas`; their
  validation messages are pt-BR because the UI shows them directly.
- **Booking `playerIds` lists the other players only;** the creator is added by the API (singles:
  1 other, doubles: 3 others).
- **Scores** are sent as structured sets from side A's point of view (`{ a, b, tiebreak }`);
  `parseScore("6-4, 3-6, [10-8]")` produces the same structure from text. A match tie-break is
  only valid as the third set; extended tie-breaks must end exactly 2 apart (11-9, 12-10…).
- **Guest documents:** CPF is validated with its check digits; RG formats vary by state, so RG
  only needs 5–14 letters/digits.
- **Lesson series:** a weekly repeat must include the weekday of its first lesson.
- **shadcn/ui was initialized by hand** because the sandbox blocks `ui.shadcn.com`; the files
  match what the CLI generates.

## Known issues

- None open.

## Needs manual check

- Nothing yet.
