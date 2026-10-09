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

## Phase 10 — PWA, polish, QA

Review the whole app against docs/SPEC.md and fix the gaps.

- PWA: manifest, icons, service worker (cache the app shell, network-first for API), install prompt, Capacitor notes in the README
- Audit: every animation uses motion.ts tokens; reduced-motion fallbacks; touch targets ≥ 44px; WCAG AA in both themes; no hover-only actions; designed empty and error states for every list
- Performance: aim for Lighthouse mobile ≥ 90 (performance + accessibility) on dashboard, calendar and leaderboard; if Lighthouse can't run here, optimize anyway and log it under "Needs manual check"
- Playwright e2e: login per role, booking, coach cancel → member book, report → approve → Elo, guest pass scan
- Final README: architecture, roles, seeded test accounts, how to run and test
  Finish with the SPEC checklist (done/missing).
