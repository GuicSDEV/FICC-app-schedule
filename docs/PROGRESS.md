# Progress

Status of each phase in [`PHASES.md`](PHASES.md), the decisions taken along the way, known issues
and what still needs a human to check.

## Phase status

| Phase | Title                                 | Status      | Commit          |
| ----- | ------------------------------------- | ----------- | --------------- |
| 0     | Monorepo setup                        | Done        | `9128b7f`       |
| 1     | Database                              | Done        | `9501ffb`       |
| 2     | Shared package                        | Done        | `feat(phase-2)` |
| 3     | API core: auth, schedule, bookings    | Done        | `feat(phase-3)` |
| 4     | API: coaches, lessons, maintenance    | Done        | `feat(phase-4)` |
| 5     | API: matches, Elo, ranking, guests    | Done        | `feat(phase-5)` |
| 6     | Frontend foundation (design + motion) | Done        | `feat(phase-6)` |
| 7     | Member: dashboard, calendar, booking  | Done        | `feat(phase-7)` |
| 7.5   | Multi-club-ready foundation           | Not started |                 |
| 8     | Member: matches, ranking, H2H, guests | Not started |                 |
| 9     | Coach, gate, admin screens            | Not started |                 |
| 9.5   | Tournaments & circuits                | Not started |                 |
| 10    | PWA, polish, QA                       | Not started |                 |
| 11    | SaaS extensibility & feature workflow | Not started |                 |

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
- **Auth cookies:** `ficc_at` (httpOnly access JWT, 15 min), `ficc_rt` (httpOnly rotating refresh
  token, 30 days, path `/api/auth`) and `ficc_role` (readable role hint for web routing only).
  The API also accepts `Authorization: Bearer` (tests, future Capacitor). Reusing a rotated refresh
  token revokes the whole family. The web app calls the API directly with credentials; both must
  share a site (localhost, or sibling subdomains with `COOKIE_DOMAIN`).
- **The 2-active-bookings limit applies to every tagged player**, not just the creator, so it
  cannot be bypassed by having friends book.
- **Pending bookings expire** at `min(created + 2 h, slot start)`; any decline cancels the booking.
- **Any player of a booking can cancel it** before the slot starts.
- **Schedule cell precedence:** frozen > lesson > booking > free; the underlying lesson/booking is
  still returned on frozen cells so admins can see what a freeze affects. Lesson student names and
  notes are only returned to that lesson's coach and admins.
- **Booking rules run in SERIALIZABLE transactions** with retry; concurrent requests for the same
  slot are covered by an e2e test (exactly one wins).
- **e2e tests** run against a separate `ficc_test` database with a fake clock fixed on
  Monday 2030-03-04 09:00 (club time); scheduled jobs are disabled and called directly.
- **Coaches cannot teach two lessons in the same slot** (on different courts), checked with the
  same transaction as the slot claim.
- **Weekly series skip taken dates:** the first lesson must be free; later occurrences that are
  booked, frozen or clash are skipped and reported (`skippedDates`). The nightly generator does
  the same and never re-creates a date that already has an occurrence (cancelled ones included).
- **"Cancel this and all future"** sets the series `endDate` to the day before (never before its
  start) and cancels every later scheduled occurrence.
- **Moving a lesson to another date** detaches it from its series (it becomes a one-off);
  changing only court or slot keeps the series link. Admins can also reassign the coach.
- **Undo:** a cancelled occurrence can be restored while its slot is still free.
- **SLOT_OPENED** is only sent for freed slots within the next 14 days, so ending a series does not
  flood watchers.
- **Freeze banner data** (`GET /freezes/active`) includes freezes that start within 24 hours,
  flagged `active: false`. Impacted members and coaches get `COURT_FROZEN` / `COURT_UNFROZEN`.
  Open-ended freezes list affected items for the next 8 weeks.
- **Deactivating a coach** disables the login, revokes sessions and stops series generation; their
  existing lessons stay for the admin to cancel or reassign.
- **Elo is applied on confirmation** (opponent approval, 48 h auto-approve or admin resolution)
  using the players' ratings at that moment, in one serializable transaction. The
  `MATCH_CONFIRMED` notification carries the personal before/after/delta and overall rank movement
  for the celebration screen.
- **Who approves:** any player on the side opposite the reporter. Results can be reported up to 30
  days after the match, never for future dates.
- **Booking-linked reports** must use exactly the booking's players and date, and a booking can only
  be reported once (voided matches excepted). Court and surface come from the booking.
- **Leaderboards rank by Elo** (ties share a rank) and include members without matches (0-0); the
  trend is the sum of Elo changes in the last 30 days. H2H counts every confirmed match where the
  two played on opposite sides (singles and doubles), with scores shown from player A's view.
- **Guest QR tokens** are HS256 JWTs (`GUEST_PASS_SECRET`) holding only the pass id and expiring at
  the end of the visit date (club time). Gate check order: signature → cancelled → already used →
  date → blocked document → suspended host; the single entry is an atomic ACTIVE → USED update.
  Expired and early passes both report `WRONG_DATE`.
- **Admins never receive document numbers:** lists are masked and blocking from a list uses the
  pass id (`POST /admin/guests/blocks/from-pass/:passId`). Passes can be created up to 60 days
  ahead; blocked documents are refused at creation too.
- **shadcn/ui was initialized by hand** because the sandbox blocks `ui.shadcn.com`; the files
  match what the CLI generates.
- **Fonts are self-hosted** with `next/font/local` (Bricolage Grotesque from
  `@fontsource-variable`, Geist from the `geist` package) because Google Fonts is unreachable at
  build time in some environments and self-hosting avoids a runtime dependency.
- **Theme:** dark is the default (`next-themes`, stored in `localStorage`); all colors are OKLCH
  tokens in `globals.css`. The coach area (`data-area="coach"`) swaps the primary accent to violet.
- **Member navigation:** bottom bar Início · Quadras · ＋ (action sheet) · Ranking · Partidas; the
  profile lives behind the header avatar (and the desktop sidebar), so the bar keeps 4 tabs + FAB.
- **Page transitions are enter-only** (`template.tsx` per area with fade + 8 px slide-up). The App
  Router unmounts the old page immediately, so exit animations would need a frozen router context;
  enter-only keeps navigation instant.
- **Session:** `useSession` only queries `/auth/me` when the `ficc_role` hint cookie exists, so the
  login page does not log 401s. The middleware routes by that hint; the API remains the authority.
- **The rain/maintenance banner is global:** every signed-in area shows active freezes.
- **`/dev/components`** (living component showcase) is hidden in production builds unless
  `NEXT_PUBLIC_SHOW_DEV_PAGES=true`.

- **Phases 7.5, 9.5 and 11 were added by the product owner mid-run** (multi-club foundation,
  tournaments, SaaS extensibility). Order: 7 → 7.5 → 8 → 9 → 9.5 → 10 → 11. Phase 7 was finished
  first because it was in progress; Phase 7.5 then moves its strings to next-intl too.
- **Booking window: 14 days** (`BOOKING_WINDOW_DAYS` in shared). The spec gives none; the calendar
  day strip shows the same window and the API refuses later dates (`BEYOND_BOOKING_WINDOW`).
- **Coach profile for members:** `GET /coaches/:id` (active coaches only) returns courts, lessons in
  the next 7 days and the next 6 lessons that have not started. The lesson chip opens it.
- **The calendar loads the whole day once and filters by surface on the client,** so the
  All / Har-Tru / Saibro filter animates instantly without a request.
- **Favorites are toggled from the slot sheets** (free, lesson and booking): a favorite watches a
  court + time slot on every day, which is what `SLOT_OPENED` notifies about.
- **The "booking confirmed" moment:** the sheet shows the drawn check and the ticket; the cell's
  surface-color fill plays as the sheet closes so it is actually visible.
- **Dashboard invites** are swipe cards (right confirms, left declines, buttons too); result
  approvals can be approved right there, disputes go through the match page (Phase 8).
- **Narrow slot chips** (6 courts at 390 px) stack avatar over court name; wider chips (surface
  filter, desktop grid) show coach names and up to 4 player avatars.

## Known issues

- None open.

## Needs manual check

- Feel of gestures (swipe cards, pull-to-refresh, bottom sheets) and haptics on a real phone;
  verified here only with Playwright touch emulation at 390 px.
- iOS safe areas (notch / home indicator) on a real device.
- Live calendar updates between two real phones (verified here with two Playwright browser
  contexts: a booking in one appears in the other without reload).
