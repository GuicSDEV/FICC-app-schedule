# Progress

Status of each phase in [`PHASES.md`](PHASES.md), the decisions taken along the way, known issues
and what still needs a human to check.

## Phase status

| Phase | Title                                 | Status                              | Commit            |
| ----- | ------------------------------------- | ----------------------------------- | ----------------- |
| 0     | Monorepo setup                        | Done                                | `9128b7f`         |
| 1     | Database                              | Done                                | `9501ffb`         |
| 2     | Shared package                        | Done                                | `feat(phase-2)`   |
| 3     | API core: auth, schedule, bookings    | Done                                | `feat(phase-3)`   |
| 4     | API: coaches, lessons, maintenance    | Done                                | `feat(phase-4)`   |
| 5     | API: matches, Elo, ranking, guests    | Done                                | `feat(phase-5)`   |
| 6     | Frontend foundation (design + motion) | Done                                | `feat(phase-6)`   |
| 7     | Member: dashboard, calendar, booking  | Done                                | `feat(phase-7)`   |
| 7.5   | Multi-club-ready foundation           | Done                                | `feat(phase-7.5)` |
| 8     | Member: matches, ranking, H2H, guests | Done                                | `feat(phase-8)`   |
| 9     | Coach, gate, admin screens            | Done                                | `feat(phase-9)`   |
| 9.5   | Tournaments & circuits                | Done                                | `feat(phase-9.5)` |
| 9.8   | FICC operations adjustments           | Done                                | `feat(phase-9.8)` |
| 10    | PWA, polish, QA                       | Done                                | `feat(phase-10)`  |
| 11    | SaaS extensibility & feature workflow | On hold — waiting for club approval |                   |
| 12    | Native apps (App Store & Google Play) | On hold — waiting for club approval |                   |

Execution order: 7.5 → 8 → 9 → 9.5 → 9.8 → 10. Work stops after Phase 10 until the club approves
Phases 11 and 12.

## Security

- **`.env` is git-ignored and has never been committed** (checked with
  `git log --all --full-history -- .env`, which returns nothing). No secrets need rotating.
  Only `.env.example` is in the repo, and it holds placeholders and local-only development
  values (the docker-compose database password `ficc`, `change-me…` secrets).
- Production must set its own `JWT_ACCESS_SECRET`, `GUEST_PASS_SECRET` and
  `DATA_ENCRYPTION_KEY`; the API refuses to start in production without them.

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

- **Phases 7.5, 9.5, 9.8, 11 and 12 were added by the product owner mid-run** (multi-club foundation,
  tournaments, SaaS extensibility). Order now: 7.5 → 8 → 9 → 9.5 → 9.8 → 10; 11 and 12 are on hold. Phase 7 was finished
  first because it was in progress; Phase 7.5 then moves its strings to next-intl too.
- **Booking window: 14 days** (`bookingWindowDays` in `ClubSettings` since Phase 7.5). The spec gives none; the calendar
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

- **Tenancy (Phase 7.5):** every club-owned model has `clubId`. The API's `PrismaService` is the
  Prisma client wrapped in a tenant extension that adds `clubId` to every `where` and stamps it on
  every create (nested creates too), reading the club from an `AsyncLocalStorage` context set by a
  middleware (one club per deployment: `DEFAULT_CLUB_SLUG`). Jobs and sockets set the context
  explicitly. `PrismaBaseService` (unscoped) is only used for clubs, health and job fan-out. The
  JWT carries the club id and the guard rejects tokens from another club.
- **`clubId` has a database default of `current_setting('app.club_id', true)`**, which is never set:
  it only makes Prisma type the column as optional (so callers do not pass it); an unscoped insert
  still fails on NOT NULL instead of silently landing in some club.
- **Club rules live in `ClubSettings.values` (JSON)** validated by a Zod schema merged over defaults
  (`clubSettingsSchema` in shared): booking window, active-booking limit, confirmation window,
  auto-approve hours, report window, Elo K and initial rating, trend days, lesson generation
  window, slot-opened notice window, slot duration, guest-pass horizon, guest data retention. JSON
  keeps adding a rule to a one-line change; the schema keeps it typed. Read through a 30 s cache.
- **Categories are a per-club table** (`Category`, key + label + order) replacing the old enum;
  the API speaks category keys, labels come from the club. An unknown category on the
  leaderboard is a 400 `VALIDATION_FAILED`, like any other invalid query value.
- **Ratings are per sport** (`PlayerRating`, `EloHistory.sport`, `Match.sport`); `User.elo` was
  moved there. Courts have a `sport` (TENNIS only for now). Scoring rules sit behind
  `SportRules` (`TennisRules`), so result validation asks the match's sport.
- **`Match.matchType` was renamed `format`** (SINGLES/DOUBLES) to free `type` for
  FRIENDLY/RANKED/TOURNAMENT. Existing and reported matches are RANKED (they move Elo, as before);
  `tournamentId` is nullable and unused until Phase 9.5.
- **i18n:** API messages, validation messages and domain labels live in one catalogue in shared
  (`packages/shared/src/i18n/pt-BR.ts`), so the web shows the same text for client-side
  validation. Errors carry a stable `code` plus the translated `message`. Screen copy lives in
  `apps/web/messages/pt-BR.json` (next-intl, pt-BR only). Dates, times and numbers are formatted
  through `useFormat()` with the club's locale and time zone. Blocked-slot reasons are codes
  (`BOOKING`, `LESSON`, `FROZEN`…), not text.
- **API prefix is `/api/v1`** (the refresh cookie path follows: `/api/v1/auth`).
- **Background jobs run on BullMQ** (queue `club-jobs`, Redis) with repeatable schedulers:
  booking expiry and freeze announcements every minute, match auto-approval every 5 minutes,
  lesson generation hourly (and at boot), LGPD jobs daily (and at boot). Each run loops over
  active clubs inside that club's tenant context; every job is idempotent, so a retry or a
  second worker does no harm. Socket.IO uses the Redis adapter and club-scoped rooms.
- **LGPD:** guest document numbers are stored AES-256-GCM encrypted (`documentCipher`) plus an
  HMAC (`documentHash`) for exact-match lookups (blocks, duplicates). A daily job encrypts any
  legacy plain-text rows and another anonymizes guest name/document after
  `guestDataRetentionDays` (90). The gate's partial-document search decrypts only today's passes
  in memory.

- **Match detail opens as an overlay on the matches list** (`/app/matches?m=<id>`), so its panel can
  morph out of the tapped card (only the card's surface morphs; text fades in, so nothing
  stretches). `/app/matches/<id>` is the same detail as a page, for notifications and links.
- **Reporting from a booking:** recent bookings that ended and have no result yet are offered as
  chips (the API now leaves reported bookings out of `recent`). For doubles the member taps their
  partner; the other two become the opponents. The reporter is always on side A.
- **Score entry** uses per-set steppers (games 0–7, tie-break points 0–30). The third set appears
  only when the first two are split, as a regular set or a match tie-break. Validation runs live
  with the sport's rules (`SportRules.scoreSchema`, plus a new `setWinner` per set).
- **The Elo celebration is global in the member area,** triggered by each `MATCH_CONFIRMED`
  notification (approval, auto-approval, admin resolution); several in a row play one after the
  other. Confetti only on wins, never with reduced motion. The rank badge animates when the
  player climbed.
- **Leaderboard reorder:** each new version of a board is compared with the previous one; rows
  (and podium places) that moved flash for 2.4 s with ↑/↓ while `layout` animates the reorder.
- **Profiles:** `/app/profile` (own: ladder card, preferences, sign-out) and `/app/players/<id>`
  (anyone, with "compare" into H2H). Charts use Recharts, loaded on demand.
- **Chart and H2H colors use the `-ink` tokens** (lime/violet in dark, darker olive/violet in light)
  so lines and numbers keep contrast on the light background.
- **Guest pass sharing** renders a PNG of the pass (club, guest, date, QR) on a canvas and shares it
  with the Web Share API (files); browsers without file sharing download it instead. The image
  uses the fixed SPEC palette so it looks the same whatever theme the sender uses.

- **Coach area:** Agenda (allowed courts, own lessons listed above the grid with swipe-left to
  cancel that day and a 5 s undo in the toast), Quadras (whole club, read-only except own lessons
  and free slots on allowed courts) and Perfil. Undo restores the lesson only while its slot is
  still free; if a member took it in between, the toast shows the API's message.
- **One lesson form and one actions sheet for coaches and admins** (`lessonApi(mode)` picks the
  routes); admins also pick or reassign the coach, which limits the courts to that coach's.
- **Gate scanner** uses `@zxing/browser` (loaded on demand) on the rear camera; the same code is
  ignored for 4 s and scanning pauses while a result is on screen. Accepted results close by
  themselves after 5 s; refusals wait for a tap. Camera starts are chained so a late start never
  clears the video of the next one (it happened with React's double-run effects).
- **Gate result colors** are their own tokens (`--gate-accepted`, `--gate-refused`), the same in
  both themes, so white text keeps AA contrast.
- **Freeze bulk cancel preselects** everything for a freeze with an end time, but only today's
  items for an open-ended freeze (its list covers the next 8 weeks); select all / none is one tap.
- **Admin pages use a non-sticky header** because the admin shell already has a sticky tab row on
  phones.
- **Dispute "correct the score"** takes the score as text ("6-4, 3-6, [10-8]", side A first),
  parsed with the sport's rules.

### Phase 9.5 — Tournaments & circuits

- **Status flow** is one shared table (`TOURNAMENT_TRANSITIONS`) used by the API and the organizer
  screen; the API also moves a tournament forward on its own (draw published, first result, last
  final). Drafts are visible only to admins and the tournament's organizers; the public link of a
  draft answers 404.
- **Who runs a tournament:** admins create tournaments, circuits, duplicates and choose organizers;
  member organizers get the same manager at `/app/tournaments/:id/manage` (the API checks
  `canManage` on every call).
- **Seeding:** manual seeds win; otherwise average Elo (guests count as the initial rating) or
  circuit points. Byes go to the top seeds (standard positions 1 v 8, 4 v 5…).
- **Groups:** snake distribution by seed, round robin, standings by wins → head-to-head → sets ratio
  → games ratio → seed. A walkover counts 6-0 6-0 in the table. The knockout is built from the
  group places when the last group match is confirmed.
- **Score formats** per category: 2 sets + match tie-break, best of 3 full sets, or a pro-set to 8
  (8-6 / 9-7 / 9-8). Scores travel side A first; the sheet shows the viewer's side on the left.
- **Results:** a player reports, the opponent (other side) confirms; without a reply it is
  auto-confirmed after the club's `matchAutoApproveHours`. Organizers' scores and W.O. /
  retirement / disqualification are final at once and can be corrected until the next round is
  played or Elo has been applied. Matches still without a result 2 h after their slot ended are
  "overdue" (organizer alert + pending panel).
- **Elo:** only categories marked "vale Elo" create rated matches, and only between members;
  guests and external players never touch the ladder.
- **Order of play** blocks bookings, lessons and freezes and occupies the slot (calendar shows a
  gold "Torneio" chip that opens the tournament's schedule). Auto-schedule respects availability
  (weekday / weekend "not before" times and unavailable days), rest minutes and round order.
  Players are notified only when a day is published, and again for each change after that.
  Rain: "Reprogramar jogos interditados" moves every match on a frozen court to the next free
  slots in one go.
- **Circuit points** are awarded when a stage is finished (champion 100, vice 70, semifinal 45,
  quarterfinal 25, R16 15, R32 10, participation 5 by default, editable per circuit); ties share
  the position.
- **Public page** `/t/:publicId` (unguessable id, outside the auth area) is read-only, refreshes
  every minute and has a generated share image (`opengraph-image`) with name, dates, place and
  champions. **PDF**: `/t/:publicId/print?view=draw|day` renders a black-on-white A4-landscape
  page; "Imprimir" opens the browser print dialog ("Salvar como PDF"). No server-side PDF library.
- **Rules text** supports a tiny safe Markdown subset (paragraphs, lists, bold, italic, links); no
  HTML is ever injected.
- **Bracket view:** one column per round with SVG elbows, horizontal and vertical scroll inside a
  bounded box, pinch (two-finger) and ctrl/trackpad zoom from 45 % to 160 % plus buttons. A result
  that arrives while the bracket is open lights its connector and sends a ball along it to the
  next round; results already there are drawn lit without animation.
- **Champion screen** (trophy + confetti) opens from the `TOURNAMENT_CHAMPION` notification; Elo
  celebrations for the same matches queue after it.
- **Hall of fame** on player profiles lists titles and finals ("Galeria de títulos").
- **Fees are informative** (no payment gateway): organizers mark entries paid / unpaid / exempt and
  export entries as CSV.
- Verified in the browser (Playwright, 390 px and 1280 px, dark and light): member registration
  (12th singles entry), admin closes registration, generates and swaps the draw, publishes both
  categories, schedules by tap and by drag, auto-schedules three days and publishes them; a player
  reports a pro-set score and the opponent confirms in the UI; the organizer drives the 12-player
  singles knockout (with byes) to a champion while the member watches (champion screen, Elo,
  title on the profile) and the 5-team doubles groups → knockout to a champion; circuit ranking
  after finishing; public page without login, share image, printable draw and day order of play
  exported to PDF. The API e2e suite covers 12-player singles and 8-team doubles groups → KO from
  creation to champion, a two-stage circuit ranking, the public link and rain rescheduling.

### Phase 9.8 — FICC operations adjustments

- **Every rule is a ClubSettings value** edited at `/admin/settings` (SETTINGS_MANAGE): per-weekday
  grids (start times picked from the club's `TimeSlot` rows; a weekday with no grid uses every
  slot, an empty grid closes it), per-weekday court mode, booking window, opening rule, limits,
  free play, sign-up approval, dependents, late-cancellation window, no-show penalty and the older
  numeric rules. Date exceptions (close the club or some courts, another grid or mode, a note) are
  managed by COURTS_MANAGE on the same page and override the weekday. One shared `dayPlan()`
  decides how a date works for the calendar, bookings, lessons and tournament scheduling.
- **FICC defaults in the seed:** weekdays 8 slots (08:30…21:00), weekends 7 slots
  (07:15…17:15), Saturday is FREE_PLAY, bookings for a day open **1 day before at 07:00**, 1
  booking per member per day. New clubs start with no opening rule (bookable as soon as the day
  enters the window).
- **Opening rush:** the countdown runs on the server clock (`serverNow` in every day plan and
  error); the booking request fails fast on an occupied slot before the serializable transaction
  (8 attempts with jittered backoff) and answers `SLOT_TAKEN` with the next free options, shown as
  chips in the booking sheet. Booking creation is rate limited to 5 requests per 10 s per member.
  The limiter is **in memory per API instance** (enough for one instance; a Redis limiter is
  needed if the API runs on several). The load test fires 150 simultaneous requests for 6 courts:
  exactly 6 win, everyone else gets a clear answer (≈2 s in total here).
- **Free play:** check-in (player + up to 3 partners) on a free court; it ends by itself after
  `freePlay.sessionMinutes` (default 75). Courts under a lesson, tournament match or freeze show as
  busy. With the queue on, a freed court is offered to the first in line for `claimMinutes`
  (default 5) with a push notification; unclaimed offers pass to the next person (job
  `free-play.tick`, every minute, idempotent).
- **Sign-up approval** is on by default: self sign-ups are PENDING, cannot log in (the login says
  so), staff with MEMBERS_APPROVE approve or reject with a reason the person reads at login; the
  approved member gets a notification. The holder name from the imported list is shown next to the
  typed name, with a warning when they differ. CSV import is unchanged.
- **Dependents** (off by default): "1234-01" style matrículas validated against the holder's
  imported matrícula; each dependent has their own login and rating.
- **Roles:** default roles per club — Secretaria (bookings/no-shows, courts and exceptions, Mural,
  approvals, guests), Diretoria (everything except platform), Professor (no admin permissions;
  coaches keep their portal), Super admin (all). Roles are editable (PLATFORM_MANAGE) and people
  can hold several (permissions add up). Nobody can grant a permission they lack, and the club
  can never lose its last active Super admin. An ADMIN account without roles sees nothing in the
  admin area. Existing ADMIN users were migrated to Super admin, coaches to Professor.
- **Audit log:** an interceptor records every successful POST/PUT/PATCH/DELETE by a staff account
  (who, route, record id, body with passwords/tokens masked). Personal actions (reading a post,
  marking notifications read) are marked `@SkipAudit()` and stay out.
- **No-shows:** staff (BOOKINGS_MANAGE) or a co-player, after the slot started, mark a player;
  cancelling inside `lateCancellationMinutes` records a late cancellation. History per member in
  the admin member sheet. The penalty (suspension after N in M days) is **off by default**.
- **Mural** (`/app/news`, managed at `/admin/news` with NEWS_MANAGE): title, text, photos (image
  URLs, no upload storage yet), event date, pinned, optional push to every active member, 👍
  reactions, read counts for staff (a post counts as read when it is on screen). The dashboard
  shows the latest pinned post.
- Backlog (not implemented) is in `docs/BACKLOG.md`.
- Verified in the browser (Playwright, 390 px and 1280 px): rules editor (grids, modes, save bar),
  a date exception turning today into a free-play day; Sunday's countdown "Reservas abrem 10 de
  out, 07:00" and Saturday's free-play banner; check-in, all courts busy → queue position →
  check-out → the first in line gets the court offer with a 5-minute countdown and a
  COURT_AVAILABLE notification → claims it; self sign-up → pending screen → login refused →
  Secretaria approves (member logs in and sees the approval notification) and rejects another
  with a reason shown at login; admin navigation per role (Secretaria: Interdições, Reservas,
  Quadras agora, Mural, Sócios, Convidados, Regras do clube, Portaria; Diretoria and Super admin:
  everything, only Super admin edits roles); a Mural post with push reaches members.

### Phase 10 — PWA, polish, QA

- **PWA:** `app/manifest.ts` (built per request so it carries the club's name; standalone, starts
  on `/app`, shortcuts to booking, "Quadras agora" and ranking), icons rendered from the ball mark
  (`public/icons`: 192/512 any, 512 maskable, Apple touch) and a small `favicon.ico`. The service
  worker (`public/sw.js`, plain JS, registered only in production builds) caches pages network
  first with the last good copy offline and `/offline` as the fallback, build assets cache first,
  and API GETs network first with the last answer offline (auth and sockets never cached; writes
  always need the network). Logout tells it to drop cached API answers and pages. Install prompt:
  a card on the dashboard (bottom, dismissible) and in the profile; Android/desktop use the
  browser prompt, iPhone gets the share-sheet steps. An offline banner explains stale data.
- **Server-side first paint:** the root layout fetches the club (`getClub`, 5-minute cache) and
  seeds the client cache (refreshed in the background); member, coach and gate layouts read the
  `ficc_role` cookie so the shell renders on the server instead of waiting for `/auth/me`; the
  dashboard, calendar and ranking prefetch their first queries on the server with the person's
  cookies (`Prefetched` in `lib/server-prefetch.tsx`) and hand them to TanStack Query. Anything
  that fails there (expired access cookie, API down) is simply fetched by the browser as before.
- **Entrances and hydration:** content in the server HTML must not wait for scripts at opacity 0.
  The page transition and the login/sign-up entrances are CSS animations built from the motion
  tokens (`--duration-*`, `--ease-out`); Motion entrances use `initial={enter("hidden")}`, which
  skips the entrance for elements already on screen at load and plays it for everything mounted
  later. Reduced motion still turns all of it into an instant change.
- **Slot catalogue (spec: "make the grid admin-editable"):** staff with SETTINGS_MANAGE add a
  start time (with its duration) or retire one at `/admin/settings`; slots are never deleted
  (history points at them). A start time still in a weekday grid, a future date exception, a
  future booking or lesson, or a running series cannot be retired. Grids, date exceptions and new
  slots are checked so two slots of one day never overlap (`findOverlap` in `@ficc/shared`).
- **Smaller wins:** socket.io is loaded after the first paint (and reconnects only when the user
  id changes, not on every profile refetch); Geist Mono is no longer preloaded; the login page is
  server-rendered (no `useSearchParams` bailout).
- **Audit fixes:** two ad-hoc animation values replaced by tokens; touch targets ≥ 44 px
  (segmented controls, chips, links on the dashboard, bracket zoom, member-picker remove button
  via a larger hit area); motion `whileTap` wrappers inside links no longer add a second tab stop;
  accessible names start with the visible text (day strip, avatar link, 👍 button); heading order
  on the dashboard; light-theme `--danger-ink` darkened for AA. axe-core (WCAG 2.1 A/AA,
  including contrast) reports no violations on 29 pages × 2 themes, and every interactive element
  measured at 390 px is at least 44 × 44 px (one visually hidden file input aside).
- **Lighthouse (mobile, `next start` on localhost, after the changes above):** accessibility 100
  and best practices 96–100 on login, dashboard, calendar and ranking. Performance with
  Lighthouse's default 4× CPU slowdown: login 68–76, dashboard 50–59, calendar 52–53, ranking
  57–59. This container benchmarks at ~900–1500 (Lighthouse's own guidance is about a 2× slowdown
  for such a machine); with 2×: login 86–87, dashboard 80, calendar 69–73, ranking 70. CLS is 0.
  The observed (unsimulated) LCP equals FCP on every page — the content is in the first paint —
  but on localhost the scripts arrive before the first frame, so Lighthouse's model charges
  hydration to LCP. **The ≥ 90 target is not met here**; it has to be re-measured on the deployed
  site (see "Needs manual check").
- **Browser e2e (Playwright, `apps/web/e2e`, `pnpm test:browser`):** login for every role and the
  area redirects, the Secretaria menu, a wrong password; booking with a partner seen by another
  member; coach cancels a lesson → member books the freed slot; report → opponent approves → Elo
  moves by the same amount both ways; gate scans a guest pass QR through Chromium's fake camera
  (accepted, then refused as already used). The global setup reseeds and relaxes the booking
  opening rule so the journeys do not depend on the time of day. 12/12 pass.
- **Verified here:** service worker active and controlling; ranking reloaded offline from cache
  with the offline banner; logout empties the API cache; manifest served with the club's name; no
  hydration errors on the member, coach and gate pages.

## SPEC checklist

Review of [`SPEC.md`](SPEC.md) at the end of Phase 10. ✅ done · ⚠️ partial / differs (reason
in Decisions) · ⏸ on hold by the product owner.

**Tech stack**

- ✅ pnpm + Turborepo monorepo; Next.js 15 App Router + Tailwind v4 + shadcn/ui; NestJS modular
  API; Prisma + PostgreSQL; `packages/shared` (Zod, DTOs, Elo, score validation, slot helpers)
- ✅ Motion + vaul; TanStack Query with optimistic updates; Socket.IO for calendar, leaderboard,
  notifications, tournaments, free play and news
- ✅ JWT access + refresh in httpOnly cookies, argon2; qrcode, club-time helpers (`date-fns-tz`
  inside `@ficc/shared`), Recharts, sonner, lucide-react, canvas-confetti; no payment gateway
- ✅ PWA: manifest, service worker, install icons, `viewport-fit=cover` + safe-area insets

**Design system "Night Session"**

- ✅ OKLCH tokens (background, surface, saibro, hartru, ball, lesson, success/danger/warning), dark
  default + light; Bricolage Grotesque / Geist Sans / Geist Mono tabular numbers; type scale;
  16 px cards, pills, layered shadows, glass bottom nav and sticky headers, grain, court lines
- ✅ WCAG AA in both themes (axe-core, 29 pages × 2 themes); touch targets ≥ 44 px; no hover-only
  actions; primary actions in the thumb zone
- ⚠️ Mobile bottom bar: Início · Quadras · ＋ · Ranking · Partidas; Profile lives behind the header
  avatar (and the desktop sidebar) so the bar keeps four tabs around the central "+"
- ✅ Tablet/desktop collapsible sidebar with 2–3 column content

**Motion system**

- ✅ `lib/motion.ts` tokens (durations, easings, springs) and variants; only transform/opacity
- ⚠️ Page transitions are enter-only (fade + 8 px slide-up, now a CSS animation from the same
  tokens so server HTML paints at once); exit animations would need a frozen router context
- ✅ 40 ms list stagger (max 8); tap feedback + `navigator.vibrate`; `layoutId` morphs (match card
  → detail, avatar → profile, nav pill); shimmer skeletons; number tickers; vaul sheets with
  scaled background; swipe invites; pull-to-refresh with the spinning ball; reduced motion
- ✅ Signature moments: Elo celebration (ticker, +N chip, confetti, rank climb), leaderboard FLIP
  reorder with ↑/↓ flash, booking confirmed (surface fill, drawn check, ticket), lesson cancelled
  live on every calendar, guest QR scan-line reveal + 3D tilt, rain mode banner + stripes + rain icon

**Courts & schedule**

- ✅ Q1–Q4 Har-Tru, Q5–Q6 Saibro; 75-minute slots `08:30 … 21:00`; the slot catalogue and the grid
  of each weekday are admin-editable (Phase 9.8 grids, Phase 10 start times)
- ✅ Lesson template seeded as Mon–Fri series for Alan, Phelipe and "Professor do Clube"
- ✅ `LessonSeries` + `Lesson` occurrences (rolling 8-week generation job, one-off lessons,
  SCHEDULED/CANCELLED, notes/students); calendar reads occurrences only

**1. Authentication & members**

- ✅ Matrícula + password, validated against the imported list (CSV import); roles MEMBER, COACH,
  ADMIN, GATE with per-role areas; coach accounts by email; categories (per-club table), Elo 1200
- ✅ Login hero with court lines, auto-formatted matrícula, shake on invalid credentials

**2. Court booking**

- ✅ Singles = 2, doubles = 4 players; PENDING → confirm/decline → CONFIRMED / CANCELLED; 2 h expiry
  job; one transaction with the shared slot occupancy key; no double booking, player clash, limit
  of active bookings, past or frozen slots; favourites with "slot opened" notifications
- ✅ Mobile calendar (snap day strip, segmented surface filter, slot rows with Q1–Q6 chips and all
  states, booking sheet with member search, coach profile on lesson tap, live updates); desktop grid

**3. Coach portal**

- ✅ `/coach` with Agenda · Quadras · Perfil and the violet accent; weekly agenda on allowed courts
- ✅ Add lesson (one day / weekly with end date, students, note), cancel one day / this and future,
  edit (move), swipe-left cancel with 5 s undo; live violet → free; "slot opened" notifications;
  copy week; admins manage coaches, allowed courts, all lessons and the `LessonAuditLog`

**4. Guest day pass**

- ✅ No quota, one date, one entry; name + CPF/RG + date, optional booking link; signed QR token;
  Web Share / download as image; admin history per member and document, block document, suspend
  host; gate scanner with full-screen result, scan log, manual search by document; masked
  documents everywhere except the gate

**5. Elo & ranking**

- ✅ Elo K = 32 (now a club setting) with unit tests; doubles team average; result reporting with
  shared validation (sets, match tie-break, best of 3); approve / dispute / 48 h auto-approve;
  admin dispute queue (accept, correct, void); optional booking link
- ✅ Leaderboards by category with rank, Elo, W/L, win rate and 30-day trend, podium, live updates;
  head-to-head (record, win rate, Elo chart, last 5 meetings, surface split)

**6. Maintenance & rain mode**

- ✅ Freeze per court / surface / all with reason, start and optional end; blocks bookings and
  lessons; affected list with bulk cancel; notifications + global banner; unfreeze animates back

**7. Notifications**

- ✅ `Notification` model, bell with animated badge, notification center, real-time over socket;
  `NotificationChannel` interface ready for Web Push / native push (⏸ Phase 12)

**8. Tournaments & circuits (Phase 9.5)**

- ✅ Everything listed in the spec: status flow, categories and formats, registration options,
  draw (seeding, byes, groups), order of play with collision guarantee and rain rescheduling,
  results with approval/organizer confirmation/W.O./overdue alerts, announcements, circuits,
  bracket with pinch-zoom and live advancement, groups view, champion screen, hall of fame,
  public link with share image, printable/PDF draw and order of play

**9. FICC operations (Phase 9.8)**

- ✅ Weekday grids + date exceptions, BOOKING/FREE_PLAY, courts now with check-in/out and queue;
  booking opening rule + daily limit, server-time countdown, rush handling with load test;
  sign-up approval, optional dependents; editable roles with audit log; no-shows, late
  cancellations, optional penalty; Mural with reactions and read counts; backlog in BACKLOG.md

**Multi-club strategy (Phase 7.5)**

- ✅ `clubId` everywhere through the tenant extension, `DEFAULT_CLUB_SLUG`, `ClubSettings`,
  `PlayerRating` per sport, `SportRules` (Tennis), per-club categories, next-intl, BullMQ, LGPD
  encryption and retention, `/api/v1`

**SaaS extensibility (Phase 11)** — ⏸ on hold, waiting for club approval.

**Native apps (Phase 12)** — ⏸ on hold, waiting for club approval (Capacitor notes in the README).

**Data model** — ✅ every listed model, plus `SlotOccupancy`, `RefreshToken`, `CourtFreezeCourt`,
tenancy, tournament, operations and audit models; enums, indexes, unique slot constraint, CHECKs.

**Performance target (Phase 10)** — ⚠️ Lighthouse mobile ≥ 90 not reached in this environment
(see Phase 10 above); accessibility 100.

## Known issues

- Lighthouse mobile performance below the 90 target in this environment (see Phase 10 above).

## Needs manual check

- Feel of gestures (swipe cards, pull-to-refresh, bottom sheets) and haptics on a real phone;
  verified here only with Playwright touch emulation at 390 px.
- iOS safe areas (notch / home indicator) on a real device.
- Live calendar updates between two real phones (verified here with two Playwright browser
  contexts: a booking in one appears in the other without reload).
- Redis/BullMQ in production: queue persistence, one worker per deployment or several (jobs are
  idempotent, verified here with one worker), and monitoring of failed jobs.
- `DATA_ENCRYPTION_KEY` custody: where production stores it and how it is backed up (losing it
  makes stored guest documents unreadable; rotating it needs a re-encryption script).
- LGPD retention period (90 days by default) confirmed by the club's legal advisor.
- Web Share with files (WhatsApp) on real Android/iOS phones; verified here only that the PNG is
  generated and downloaded (headless Chromium has no share sheet).
- QR card tilt from device orientation on a real phone (iOS needs a permission prompt, so there it
  tilts only with touch).
- Tournament bracket pinch-zoom and drag-and-drop scheduling on real devices (verified with
  Playwright: zoom buttons, ctrl+wheel, HTML5 drag on desktop and tap-to-assign on mobile).
- Share preview of the public tournament link in WhatsApp (needs a public URL; verified here that
  the page sets Open Graph tags and the image renders as PNG).
- Printing the draw / order of play on the club's printer (verified PDF export in Chromium only).
- Booking opening rush with real members on the club's network and production hardware (load
  test here: 150 simultaneous requests against one local API instance).
- Free-play queue push notifications on real phones (verified here as in-app notifications and
  the live "Quadras agora" screen).
- The club's real weekend grid, opening rule (1 day before at 07:00 assumed) and which days are
  free play: confirm with the secretaria before launch.
- Default role permissions (what Secretaria and Diretoria may do) confirmed by the board.
- Lighthouse mobile on the deployed site (HTTPS, compression, CDN) for the dashboard, calendar and
  ranking: target ≥ 90 performance; measured here 50–87 depending on CPU calibration.
- PWA install on real devices: Android/Chrome install prompt and the shortcuts, iPhone "Adicionar
  à Tela de Início", standalone launch, status-bar colour; offline use on a flaky mobile network.
- Gate camera scanning on real phones (iOS Safari and Android Chrome) and in the gate's lighting;
  verified here with Chromium's fake camera playing a QR video (accepted, then "already used").
