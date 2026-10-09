# Phases

Build order for the project. Each phase is implemented completely, verified with its "Done when"
checks, logged in `docs/PROGRESS.md` and committed as `feat(phase-N): <summary>`.

## Phase 1 — Database

Read SPEC sections CLUB COURTS & SCHEDULE, MODULES and DATA MODEL.
In `packages/db`:

- A complete `schema.prisma` with every model in DATA MODEL: enums, indexes, explicit `onDelete` rules, and ONE slot-occupancy uniqueness strategy shared by bookings and lessons (a short comment explains how it stops a lesson and a booking from taking the same court + date + slot)
- First migration
- `seed.ts` with the real club data: 6 courts (Q1–Q4 HARTRU, Q5–Q6 SAIBRO), 8 slots of 75 min, coaches Alan (Q5), Phelipe (Q6) and "Club Coach" (Q1, Q6), lesson series from the template table (Mon–Fri) with occurrences for the next 8 weeks, 1 admin, 1 gate user, ~30 members across categories with valid membership IDs, ~40 confirmed matches with consistent EloHistory
- Export a typed Prisma client
  Done when: `pnpm db:migrate && pnpm db:seed` runs clean and a seed summary is printed.

## Phase 2 — Shared package

Read SPEC sections Elo & Competitive Ranking, Court Booking, CLUB COURTS & SCHEDULE.
In `packages/shared` (pure TypeScript, no framework):

- `elo.ts`: expected score, singles update, doubles (team average, same delta to both players), K = 32, integer rounding
- `score.ts`: Zod parser/validator for scores like `6-4, 3-6, [10-8]` (valid sets, 7-6, match tie-break to 10 win by 2, best of 3, returns the winner)
- `slots.ts`: the 8-slot grid, date + slot → start/end `Date` in America/Sao_Paulo, past-slot checks
- Zod schemas + inferred types for every API DTO (auth, booking, lesson, match report/approve/dispute, guest pass, freeze)
- Vitest tests for edge cases (upsets, equal ratings, invalid 6-5 / 7-3, tie-break 10-9, 3 sets with no winner)
  Done when: `pnpm --filter shared test` passes with full coverage of elo.ts and score.ts.

## Phase 3 — API core: auth, schedule, bookings

Read SPEC sections Authentication & Members, Court Booking, Notifications. Use the DTOs from `packages/shared`.
In `apps/api` (NestJS):

- Config, Prisma module, Zod validation pipe, error filter, CORS
- Auth: member register (validated against ValidMembershipId) + login by Matrícula; coach/admin/gate login; argon2; JWT access + refresh in httpOnly cookies; `@Roles()` guard (MEMBER, COACH, ADMIN, GATE)
- `GET /schedule?date=&surface=`: the full grid (courts × slots) with each cell's state: free, lesson (coach info), booking (players), frozen
- Bookings: create singles/doubles (all SPEC rules, in a transaction), confirm/decline per player, cancel, list mine, a job that cancels PENDING bookings after 2h, slot favorites
- Notifications module + Socket.IO gateway (`schedule.updated`, `notification.created`)
  Done when: e2e tests (supertest) cover double-booking prevention, wrong player count, the max-2-active-bookings rule and the confirmation flow.

## Phase 4 — API: coaches, lessons, maintenance

Read SPEC sections Coach Portal, Court Maintenance & Rain Mode.

- Coach module: agenda for allowed courts, create one-off or weekly lesson, cancel this day / this and all future, edit (move slot/court), copy week. Coaches edit only their own lessons; admins edit everyone's. Same slot-collision guarantee as bookings. Every change is logged to LessonAuditLog.
- Job that keeps 8 weeks of occurrences generated from active series
- Cancelling a lesson emits `schedule.updated` and notifies members who favorited that slot
- Admin: CRUD for coach accounts + allowed courts; court freeze (single / all Har-Tru / all Saibro / all) with reason + time window, affected bookings and lessons listed, bulk cancel, alert broadcast; unfreeze
  Done when: e2e tests cover a coach blocked from another coach's lesson, a coach blocked from a booked slot, cancel releases the slot, and a freeze blocks booking.

## Phase 5 — API: matches, Elo, ranking, guests

Read SPEC sections Elo & Competitive Ranking, Guest Day Pass.

- Matches: report (singles/doubles, optional booking link, shared score validator), approve, dispute with comment, auto-approve after 48h (job). On approve: one transaction that updates Elo for all players with the shared elo.ts, writes EloHistory and emits `leaderboard.updated`
- Admin dispute queue: accept, edit score (recalculates), void
- `GET /leaderboard?category=` (rank, elo, wins, losses, winRate, 30-day trend), `GET /players/:id/elo-history`, `GET /h2h?a=&b=` (record, last 5, surface split, both Elo series)
- Guests: create a pass (no monthly limit, one date, single use) returning a signed QR token; list mine. Gate: `POST /gate/scan` validates signature/date/single use/blocklist and logs to GateScanLog; manual document search. Admin: guest history per member and per document, block document, suspend a member's guest privileges. Documents masked everywhere except gate responses.
  Done when: e2e tests cover approve → correct Elo change, dispute → no Elo change, and reused, blocked and expired QR passes being rejected.

## Phase 6 — Frontend foundation (design + motion)

Read SPEC sections DESIGN SYSTEM and MOTION SYSTEM carefully. This phase defines the whole look and feel.
In `apps/web`:

- Tailwind v4 theme with all color tokens in OKLCH (dark default + light), mapped into shadcn; fonts via next/font (Bricolage Grotesque, Geist Sans, Geist Mono)
- `lib/motion.ts` with duration/easing/spring tokens and variants (page, stagger list, pop, sheet)
- `lib/api.ts` (typed fetch with shared DTOs, cookie auth), TanStack Query provider, socket provider that invalidates queries on events
- Role route groups and shells: `/app` (member bottom nav with gliding indicator + central "+" action sheet), `/coach` (violet accent), `/admin`, `/gate`; sidebar on ≥768px; safe areas
- Animated components: NumberTicker, SwipeCard, Skeleton (shimmer), Sheet (vaul), AlertBanner, SlotChip (all states), AvatarStack, PullToRefresh (spinning ball), Toaster
- Page transitions via `template.tsx`; everything respects `prefers-reduced-motion`
- Login/Register as in the SPEC, working against the API with role-based redirect
- `/dev/components` page showing every component and state
  Done when: login works for every seeded role, and `/dev/components` is polished at 390px width in both themes.

## Phase 7 — Member: dashboard, calendar, booking

Read SPEC sections Court Booking and the signature moments. Use only Phase 6 components and motion tokens.

- Dashboard: Elo hero (giant number + ticker + sparkline), upcoming bookings as ticket cards, pending confirmations as SwipeCards (right = confirm, left = decline), pending result approvals, freeze banner
- Court Calendar: snap-scroll day strip, animated filter All / Har-Tru / Saibro, 8 slot rows × court chips in every state, desktop full grid, live animated cell updates, favorite toggle
- Booking sheet: Singles/Doubles, member search (name or Matrícula) with avatar chips, validation, optimistic update, plus the "booking confirmed" animation (surface-color fill + drawn check + ticket slide-up)
- Lesson chip → coach profile sheet
  Done when: the full booking flow works at 390px, two windows show live updates, and there's no layout shift while loading.

## Phase 7.5 — Multi-club-ready foundation

Strategy: v1 is built ONLY for our club, **FICC**. Don't build any multi-club or multi-sport UI or features now, but make the structural decisions that would be expensive to change later, so adding other clubs (padel, beach tennis) later is additive work, not a rewrite. The user experience stays exactly as specified for FICC.

Data & tenancy (invisible to users):

- Add `Club` (name "FICC", slug, timezone, locale, logo, brand colors) and `ClubSettings`: move every club rule currently hardcoded into it (slot grid, booking limits, confirmation deadline, result auto-approve hours, Elo K and initial rating, guest rules)
- Add `clubId` to every club-owned table with composite indexes/uniques (Matrícula unique per club); use cuid/uuid IDs everywhere; migration putting all existing data into FICC
- Request-scoped tenant context in NestJS + a Prisma client extension that automatically filters and stamps `clubId`. For v1 the club is resolved from an env var (`DEFAULT_CLUB_SLUG=ficc`), so URLs stay as they are; later it can come from a subdomain without changing routes
- One e2e test with a second club created inside the test only, proving data isolation (not seeded, no UI)

Sport-ready (tennis only):

- `Court.sport` enum with only `TENNIS` for now
- Ratings move to `PlayerRating` (membershipId/userId, sport, elo, matches); leaderboard and Elo logic read the rating for the match's sport
- Score validation and match-format rules sit behind a `SportRules` interface in packages/shared, with a single `TennisRules` implementation. No padel or beach tennis code
- Categories become a per-club table instead of an enum (seeded with FICC's categories)
- Prepare tournaments (Phase 9.5) in the data model: `Match.type` (FRIENDLY | RANKED | TOURNAMENT) and a nullable `Match.tournamentId`

Code hygiene for later:

- Extract all user-facing strings with next-intl (pt-BR only for now); dates/numbers formatted with the club's locale
- Move every scheduled job (pending booking expiry, auto-approve, lesson generation…) to BullMQ + Redis, idempotent, plus the Socket.IO Redis adapter
- LGPD basics: encrypt guest document IDs at rest (key from env) and a retention job that anonymizes guest data after 90 days (configurable in ClubSettings)
- API prefix `/v1`

Done when: all previous tests pass, the isolation test passes, and the app behaves exactly as before for FICC users.

## Phase 8 — Member: matches, ranking, H2H, guests

Read SPEC sections Elo & Competitive Ranking, Guest Day Pass and the signature moments.

- Report Result: pick players/teams (prefill from a recent booking), per-set steppers + optional match tie-break, live validation
- Match detail with shared-layout morph from its card; Approve / Dispute with comment
- Elo celebration screen (ticker, +delta chip, confetti on wins, rank badge animation)
- Leaderboard: category tabs, top-3 podium, rank/Elo/W/L/win rate/trend, live FLIP reorder with highlight + ↑/↓, pull-to-refresh
- H2H: two pickers, side-by-side stats, dual Elo line chart (Recharts with our tokens), last 5 meetings, surface split
- Guest Passes: list, create sheet (name, document, date, optional booking link), QR card with scan-line reveal + tilt, share via Web Share API / download
  Done when: report → approve (second window as the opponent) → celebration → live leaderboard reorder all work.

## Phase 9 — Coach, gate, admin screens

Read SPEC sections Coach Portal, Guest Day Pass (gate), Court Maintenance.

- Coach: weekly agenda, add-lesson sheet (just this day / repeat weekly with weekdays + end date, students/note), lesson actions (cancel this day / this and all future / edit), swipe-left cancel with 5s undo, copy week, profile. The lesson-cancelled dissolve shows live on the member calendar.
- Gate: camera QR scanner (`@zxing/browser` or similar), full-screen green/red result with guest + host, manual document search, scan history
- Admin: freeze panel (court or group, reason, window, affected list, bulk cancel), coach accounts + allowed courts, lesson oversight + audit log, dispute queue, guest history with block/suspend, membership ID CSV import
  Done when: a coach cancels a lesson and a member books that slot right after; a reused QR is rejected; a freeze shows the banner to impacted users.

## Phase 9.5 — Tournaments & circuits

Context: FICC currently runs its tournaments on LetzPlay. This module must fully replace it, so the organizer's workflow matters as much as the players' view. Known pain points to solve: results left pending for months, and players missing tournaments because notifications didn't arrive.

Roles: ADMIN can do everything; a new per-tournament `ORGANIZER` permission can be given to members who help run a tournament.

### Organizer — create & configure

- Tournament: name, cover image, description/rules (rich text), sponsor logos, dates, location (FICC courts), status flow DRAFT → REGISTRATION_OPEN → REGISTRATION_CLOSED → DRAW_PUBLISHED → IN_PROGRESS → FINISHED (or CANCELLED)
- One or more categories per tournament (each with its own draw): entry type SINGLES/DOUBLES, format SINGLE_ELIMINATION or GROUPS_THEN_KNOCKOUT (group size, how many advance), max entries, score format (best of 3 with match tie-break, pro-set to 8, etc.), whether results count for Elo
- Registration settings: window, open to members only or also guests/external players (name + phone), optional fee amount (no payment gateway: the organizer marks each entry PAID/UNPAID/EXEMPT), optional approval by the organizer
- Duplicate a past tournament as a template

### Players — registration

- "Tournaments" tab: Upcoming / Registration open / In progress / Finished, with filters by category
- Tournament page: info, rules, categories, registered players, draw, schedule, results
- Register in a category (doubles: invite a partner who must accept), add **time restrictions** ("only after 18:00 on weekdays", unavailable dates) and a note to the organizer; withdraw before the draw; waitlist when full
- Organizer view of entries: approve/reject, payment status, move between categories, export CSV

### Draw

- Automatic seeding by current Elo (standard seed positions, top seeds apart) or by circuit ranking points; byes for non-power-of-2 draws; manual seed/position adjustments before publishing
- Groups: snake distribution; round-robin fixtures; standings tiebreakers (wins → head-to-head → sets ratio → games ratio)
- Publishing the draw notifies every entrant

### Schedule (order of play)

- Organizer schedule board per day: courts × slots grid, drag matches into slots on desktop and tap-to-assign on mobile; "auto-schedule" that respects players' time restrictions, rest time between a player's matches, and existing bookings/lessons
- Tournament matches block slots exactly like bookings (same collision guarantee) and show on the court calendar with a tournament chip
- Publish the day's schedule → every affected player gets notified; any later change notifies the players involved with what changed
- Rain/maintenance: when courts are frozen, affected tournament matches are flagged and the organizer can reschedule them in bulk

### Results (no more pending results)

- Players report with the existing flow; for tournament matches, the opponent's approval OR an organizer confirmation is enough; the organizer can enter/override any result directly from their phone
- Walkover (W.O.), retirement and DQ support; winners advance automatically; group standings update live
- Deadlines: if a scheduled match has no result 2h after its slot ends, the organizer gets an alert; a "Pending results" panel shows everything overdue

### Communication

- Organizer announcements to all entrants of a tournament or a category (in-app + notification)
- Reliable notifications for: registration confirmed, partner invite, draw published, match scheduled/changed, opponent reported result, you advanced/were eliminated, announcement. Each one also shows in the notification center so nothing is missed.

### Circuits (season ranking)

- A `Circuit` groups several tournaments (stages) in a season, per category
- Points table configurable per circuit (e.g. champion 100, finalist 70, semis 45, quarters 25, R16 15, participation 5)
- Circuit ranking page with the per-stage points breakdown; it can be used to seed future stages
- This is separate from the Elo ladder; both coexist

### UI (follow the design and motion system)

- Bracket view: horizontal scroll + pinch-zoom on mobile, rounds as columns, SVG connectors; on a confirmed result the winner's name animates along the connector into the next round
- Groups view: animated standings + fixtures
- "My tournaments" card on the member dashboard: next match (time, court, opponent), status
- Champion screen when a final is confirmed (trophy animation + confetti); titles and results on player profiles (hall of fame)
- Public read-only link (no login) for each tournament: bracket, schedule, results — easy to share on WhatsApp, with proper Open Graph preview image
- Printable/PDF export of the draw and the day's order of play for the club's notice board

### Tests

Seeding/bye placement, group tiebreakers, advancement, walkover, auto-schedule respecting time restrictions and collisions with bookings/lessons, Elo applied only when enabled, circuit points calculation, overdue-result alerts.

Done when: a 12-player singles tournament and an 8-team doubles groups-then-knockout tournament can go from creation → registration → draw → scheduling → results → champion, a circuit with 2 stages shows a correct ranking, and the public link and PDF exports work.

## Phase 10 — PWA, polish, QA

Review the whole app against docs/SPEC.md and fix the gaps.

- PWA: manifest, icons, service worker (cache the app shell, network-first for API), install prompt, Capacitor notes in the README
- Audit: every animation uses motion.ts tokens; reduced-motion fallbacks; touch targets ≥ 44px; WCAG AA in both themes; no hover-only actions; designed empty and error states for every list
- Performance: aim for Lighthouse mobile ≥ 90 (performance + accessibility) on dashboard, calendar and leaderboard; if Lighthouse can't run here, optimize anyway and log it under "Needs manual check"
- Playwright e2e: login per role, booking, coach cancel → member book, report → approve → Elo, guest pass scan
- Final README: architecture, roles, seeded test accounts, how to run and test
  Finish with the SPEC checklist (done/missing).

## Phase 11 — SaaS extensibility & customer-feature workflow

Business context: this becomes a SaaS for sports clubs (tennis, padel, beach tennis). Our differentiator is close support: we sit with each club's owners and build the features they ask for. The rule that makes this scale: **build for one club, ship for all.** Every customer request becomes a configurable module or setting available to every club. Never fork the code per club, never write `if (club === 'ficc')`, and never put club-specific logic outside ClubSettings, modules or custom fields.

### 1. Module system

- A module registry in packages/shared: each module declares key, name, description, dependencies, its settings schema (Zod), permissions, nav entries and API routes
- Existing features become modules: BOOKINGS, LESSONS, GUESTS, GATE, RANKING, TOURNAMENTS, CIRCUITS
- Per-club module enablement + per-club feature flags for gradual rollout (enabled for specific clubs, then for everyone); API guards and UI navigation are driven by the registry
- Document in `docs/ARCHITECTURE.md` how to create a module, with the existing modules as examples

### 2. Self-service configuration

- Admin "Club settings" area auto-generated from each module's Zod settings schema (grouped forms with validation), so a new setting appears in the UI without building a screen
- Branding: logo, accent colors, club name, app icon (PWA manifest per club)
- Custom fields: admins can add extra fields (text, number, select, date, boolean) to members, bookings and tournament registrations; they show in forms, profiles and CSV exports

### 3. Customer feedback loop

- An in-app "Suggest an improvement / Report a problem" button for admins and members (text + screenshot + current page), stored per club
- A `/platform/feedback` inbox for us (SUPER_ADMIN): status (NEW → PLANNED → IN_PROGRESS → SHIPPED), link to the module/flag that delivered it, reply to the requester
- In-app "What's new" panel fed by a changelog; when a request is SHIPPED, the requester is notified

### 4. Integrations

- Outgoing webhooks per club (booking created/cancelled, match confirmed, tournament registration…), with signing and retries via the job queue
- Public read API with per-club API keys (OpenAPI documented), for clubs that want to connect other systems

### 5. Sales & onboarding

- Demo mode: one command creates a demo club with realistic data (members, bookings, matches, a running tournament) for owner meetings, resettable
- `/platform` dashboard: clubs, active modules per club, usage metrics (active members, bookings/week, tournaments)

### 6. Developer workflow for new features

- Create `.claude/commands/new-feature.md` (a slash command) that always follows: (1) read SPEC, ARCHITECTURE and AGENTS.md; (2) write a short spec in `docs/features/<name>.md` — problem, which club asked, how it generalizes to other clubs, settings, data model, screens; (3) implement as a module or a module extension behind a feature flag; (4) tests; (5) changelog entry; (6) update docs
- `docs/features/_template.md` with that structure
- `docs/decisions/` for architecture decision records (short ADRs), starting with one for "build for one, ship for all"
- Add the rules from this phase to AGENTS.md

Done when: an existing feature can be turned on/off per club from the platform area, a new setting added to a module schema appears in the admin UI automatically, custom fields work end to end, the feedback inbox and changelog work, and running `/new-feature` produces a spec file following the template.
