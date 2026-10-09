# ROLE
You are a senior full-stack engineer and a product designer specialized in motion design. Build a production-quality monorepo for a **private tennis club**: member management, court booking, coach lesson management and a competitive Elo ladder. It is a **mobile-first web app** that must feel like a native app on smartphones and be easy to package later with Capacitor or as a PWA.

UX quality bar: Playtomic, Strava, Linear, Apple Fitness — smooth, tactile, fast and beautiful. Design and motion are core requirements, not final polish.

---

# TECH STACK
- **Monorepo:** pnpm workspaces + Turborepo
  - `apps/web`: Next.js 15 (App Router, Server Components where sensible), TypeScript, Tailwind CSS v4, shadcn/ui
  - `apps/api`: NestJS + TypeScript, modular (auth, users, coaches, courts, schedule, bookings, lessons, matches, ranking, guests, notifications, admin)
  - `packages/db`: Prisma + PostgreSQL (schema, migrations, seed)
  - `packages/shared`: shared Zod schemas, DTO types, the Elo function, score validation and the slot grid definition
- **Animation:** Motion (`motion/react`), `vaul` for bottom sheets/drawers
- **Data:** TanStack Query (optimistic updates), Socket.IO or SSE for the real-time calendar and leaderboard
- **Auth:** JWT (access + refresh in httpOnly cookies), argon2 password hashing
- **Other:** `qrcode`, `date-fns-tz` (all times in `America/Sao_Paulo`), Recharts (Elo history), `sonner` (toasts), `lucide-react`, `canvas-confetti`
- **PWA:** manifest, service worker, install icons, `viewport-fit=cover` + `env(safe-area-inset-*)`
- No payment gateway — all users are club members.

---

# DESIGN SYSTEM — "Night Session"
Aesthetic: a premium club at night under floodlights. Dark mode by default, light mode included. Elegant and athletic, never generic.

**Color tokens** (CSS variables in OKLCH, wired into the shadcn theme):
- `--background`: near-black with a green tint (#0B0F0D) / light: off-white (#F7F6F2)
- `--surface`: elevated cards, 1px border at 8% white opacity
- `--saibro`: terracotta (#D2603A) — courts Q5–Q6
- `--hartru`: muted Har-Tru green (#4F8A68) — courts Q1–Q4
- `--ball`: tennis-ball lime (#D7F24A) — the **only** primary accent in the member area (CTAs, highlights, Elo gains)
- `--lesson`: soft violet (#8B7CF6) — lessons in the calendar and the primary accent of the coach area
- `--success`, `--danger` (coral: Elo losses, disputes), `--warning` (amber: rain/maintenance)
- WCAG AA contrast in both themes.

**Typography** (`next/font`):
- Display: **Bricolage Grotesque** (headlines, player names, the giant Elo number)
- UI/body: **Geist Sans**
- Numbers: **Geist Mono** with `tabular-nums` (scores, Elo, times, ranks)
- Scale: 12 / 14 / 16 / 20 / 28 / 40 / 56 (the dashboard Elo uses 56px)

**Shape & depth:** 16px radius on cards, pill chips; soft layered shadows; glassmorphism only on the bottom nav and sticky headers (`backdrop-blur-xl`); subtle grain texture on hero areas; thin SVG court lines as decorative background.

**Layout:**
- Mobile (<768px): fixed bottom tab bar (Home, Courts, Ranking, Matches, Profile) with a floating central "+" button (book court / report result / guest pass) that opens an action sheet
- Tablet/desktop: collapsible sidebar, 2–3 column content
- Touch targets ≥ 44px, primary actions in the thumb zone, no hover-only interactions

---

# MOTION SYSTEM
Create `apps/web/lib/motion.ts` with reusable tokens and variants. **No ad-hoc durations scattered through the code.**

**Tokens:**
- Durations: `fast 150ms` (feedback), `base 250ms` (transitions), `slow 450ms` (entrances/hero)
- Easing: `easeOut [0.22, 1, 0.36, 1]` for entrances, `easeInOut [0.65, 0, 0.35, 1]` for movement
- Springs: `snappy {stiffness: 500, damping: 30}` (buttons/toggles), `gentle {stiffness: 200, damping: 25}` (layout/sheets)
- Animate only `transform` and `opacity` (60fps on mid-range Android)

**Global patterns:**
1. **Page transitions:** fade + 8px slide-up between routes (`template.tsx` + `AnimatePresence`)
2. **List stagger:** 40ms stagger, max 8 animated items (the rest appear instantly)
3. **Tap feedback:** `whileTap={{ scale: 0.97 }}` on every pressable element; `navigator.vibrate(10)` on key confirmations where supported
4. **Shared layout:** `layoutId` to morph a match card → match detail, avatar → profile, and the bottom-nav active indicator (a pill gliding between tabs)
5. **Shimmer skeletons** instead of spinners, crossfading into content
6. **Number tickers:** Elo, wins and win rate count up/down with a spring on change
7. **Bottom sheets** (vaul) with drag-to-dismiss and scaled background
8. **Swipe gestures:** swipe a pending invite right = Confirm, left = Decline, with a colored reveal behind the card and a threshold
9. **Pull-to-refresh** with a spinning tennis ball on dashboard and leaderboard
10. **Accessibility:** respect `prefers-reduced-motion` (`useReducedMotion()`), replacing movement with simple fades. No essential information depends on animation.

**Signature moments (must be spectacular):**
- **Elo update:** after the opponent approves a result → fullscreen celebration: old Elo morphs into new via ticker, a lime `+18` chip pops with a spring, light confetti on wins, rank badge animates if the player climbed
- **Leaderboard reorder:** real-time changes reorder rows with `layout` (FLIP) animation; the moved row flashes briefly with a ↑/↓ arrow
- **Booking confirmed:** the slot fills with the court's surface color, a check icon draws itself (SVG `pathLength` 0→1), a ticket-style card slides up
- **Lesson cancelled:** the violet slot dissolves and morphs into a free slot on every connected calendar in real time
- **Guest QR:** revealed with a scan-line effect; the card has a subtle 3D tilt following touch/device orientation
- **Rain mode:** alert banner drops from the top with a spring; frozen courts get a diagonal stripe overlay and an animated rain icon

---

# CLUB COURTS & SCHEDULE (real data — seed exactly this)

**Courts:**
| Court | Surface |
|---|---|
| Q1, Q2, Q3, Q4 | `HARTRU` (Har-Tru) |
| Q5, Q6 | `SAIBRO` (clay) |

**Fixed time slots — 75 minutes each** (not hourly). Define the grid once in `packages/shared` and make it admin-editable:
`08:30 · 10:00 · 14:45 · 16:00 · 17:15 · 18:30 · 19:45 · 21:00`
(No slots between 11:15 and 14:45. The last slot ends at 22:15.)

**Current typical lesson schedule** — this is only the **default template** used by the seed. Real schedules vary day by day and coaches manage them themselves (see Coach Portal):
| Slot | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 |
|---|---|---|---|---|---|---|
| 08:30 | Lesson | — | — | — | Lesson · Alan | Lesson · Phelipe |
| 10:00 | Lesson | — | — | — | Lesson · Alan | Lesson · Phelipe |
| 14:45 | Lesson | — | — | — | Lesson · Alan | Lesson |
| 16:00 | Lesson | — | — | — | Lesson · Alan | Lesson · Phelipe |
| 17:15 | — | — | — | — | — | Lesson · Phelipe |
| 18:30 | — | — | — | — | Lesson · Alan | Lesson · Phelipe |
| 19:45 | — | — | — | — | Lesson · Alan | Lesson · Phelipe |
| 21:00 | — | — | — | — | — | — |

Seed coaches: **Alan** (allowed courts: Q5), **Phelipe** (allowed: Q6), and a generic **"Club Coach"** account for the unnamed lessons on Q1 and Q6 (the admin can rename or reassign it later). Seed the table above as recurring series for Mon–Fri.

**Lesson model (two layers):**
- `LessonSeries`: a recurring rule (coach, court, slot, weekdays, start date, optional end date)
- `Lesson`: concrete occurrences on specific dates, either generated from a series for a rolling 8-week window (scheduled job) **or created as one-off lessons with no series**. Each occurrence has a status `SCHEDULED | CANCELLED` and an optional note/student names.
The calendar and availability always read `Lesson` occurrences, never the series directly.

---

# MODULES & BUSINESS RULES

## 1. Authentication & Members
- Members register/login with **Membership ID (Matrícula)** (unique) + password. Registration is validated against a pre-seeded list of valid IDs (the admin can import a CSV).
- Roles: `MEMBER`, `COACH`, `ADMIN`, `GATE` (gate security staff). A coach is a `User` with a linked `Coach` profile (display name, photo, color, allowed courts). Coaches log in with their own credentials (the admin creates coach accounts; coaches don't need a Membership ID). After login, each role is routed to its own area (`/app`, `/coach`, `/admin`, `/gate`).
- Member profile: name, photo, categories (`CLASS_A`, `CLASS_B`, `CLASS_C`, `WOMENS`, `SENIORS` — a player may belong to several), current Elo (starts at 1200)
- Login screen: full-bleed hero with court-line illustration, auto-formatted ID input, horizontal shake on invalid credentials

## 2. Court Booking (members)
- Bookings use the fixed 75-min slots above. A slot is unavailable if it has a scheduled lesson, an existing booking, or the court is frozen.
- **Singles** = exactly 2 valid member IDs (including the creator). **Doubles** = exactly 4.
- Booking starts `PENDING`; every tagged player gets a notification + dashboard card to **Confirm** or **Decline**. All confirm → `CONFIRMED`. Any decline, or no response within 2h → `CANCELLED` and the slot is released (scheduled job).
- Backend rules (inside a DB transaction with a unique constraint on court + date + slot, shared by bookings and lessons): no double booking, a player can't be in two bookings in the same slot, max 2 future active bookings per member, no past bookings, no bookings on frozen courts or scheduled lessons.
- Members can mark a court/slot as a **favorite** to be notified when it opens up.
- **Mobile calendar UI:** horizontal snap-scroll day strip (today highlighted); animated segmented filter `All / Har-Tru / Saibro`; a vertical list of the 8 slot times, each row showing Q1–Q6 as chips colored by surface. States: free (outlined, tappable), lesson (violet, coach name + photo, lock icon), booked (player avatars), frozen (striped). Tapping a free chip opens a bottom sheet: choose Singles/Doubles, search members by name or ID. Tapping a lesson shows the coach's profile, not a booking flow. Real-time updates animate slots into new states.
- **Desktop:** full grid (6 courts × 8 slots) with the same states.

## 3. Coach Portal (role `COACH`)
Coaches get their own app area (`/coach`) with a dedicated bottom nav (Agenda, Courts, Profile) and the same design system, with lesson violet as the primary accent instead of lime.

- **Weekly agenda:** horizontal day strip + vertical slot list showing the coach's allowed courts: their lessons, free slots, and slots taken by member bookings (read-only).
- **Add a lesson:** tap a free slot → bottom sheet: "Just this day" or "Repeat weekly" (pick weekdays + optional end date), optional student names/note. Coaches can only use their allowed courts and only free slots (no lesson, no booking, not frozen). Validated in a DB transaction against the same unique constraint used by bookings, so a coach and a member can never take the same slot.
- **Cancel a lesson:** tap their own lesson → "Cancel only this day" / "Cancel this and all future" (ends the series) / "Edit" (move to another free slot or allowed court). Swipe left on a lesson card is a shortcut for cancelling that day, with undo in the toast for 5s.
- When a lesson is cancelled, the slot **immediately becomes bookable** for members and animates from violet to free on everyone's calendar in real time. Members who favorited that court/slot get a "Slot opened" notification.
- **Copy week:** duplicate this week's one-off lessons to next week in one tap.
- Coaches can edit only their own lessons. Admins can edit all lessons, manage coach accounts, change allowed courts and see a change log (`LessonAuditLog`: who, what, when).

## 4. Guest Day Pass (no monthly limit)
- Any member can create guest passes **without a monthly quota**. Each pass is valid **for one specific date only** and for **a single gate entry**.
- Required fields: guest full name + document ID (CPF/RG) + visit date. Optional: link the guest to one of the member's bookings for that day (shown on the booking card).
- The QR contains a signed token (HMAC/JWT expiring at the end of the visit date), never raw personal data. Members can share it via the Web Share API (WhatsApp) or download it as an image.
- The member is responsible for their guests; accountability comes from history, not a quota: the admin dashboard shows passes per member and per guest document, repeat visits, and can **block a guest document** or suspend a member's guest privileges.
- **Gate page** (`/gate`, roles `GATE`/`ADMIN`): camera QR scanner → validates signature, date, single use and blocklist → large full-screen green or red result with guest name and host member. Every scan is logged (`usedAt`, `scannedBy`, result). Manual fallback: search by document ID.
- Document IDs are masked in all lists (e.g. `***.456.789-**`). Only the gate view shows them in full.

## 5. Elo & Competitive Ranking
- **Elo** with K = 32: `E_a = 1 / (1 + 10^((R_b − R_a)/400))`, `R'_a = R_a + K·(S_a − E_a)`. Beating a higher-rated player gains more; losing to a lower-rated player costs more. Round to integers. Implement in `packages/shared` with unit tests.
- **Doubles:** team rating = average of its two players; each player receives the team's delta.
- **Result reporting:** any player in the match can log the score. Zod validation shared front/back: regular sets (6-0…6-4, 7-5, 7-6), and an optional match tie-break in brackets as the deciding set (e.g. `6-4, 3-6, [10-8]`, first to 10, win by 2). Best of 3.
- The opponent (or one player of the opposing team) must **Approve** or **Dispute**:
  - Approve → match `CONFIRMED`, Elo recalculated in a transaction, `EloHistory` rows written for every player, leaderboard event broadcast
  - Dispute → match `DISPUTED`, optional comment, appears in the admin queue to resolve (accept, edit score or void)
  - No response in 48h → auto-approved
- A match may be linked to a booking, but it doesn't have to be.
- **Leaderboards:** filtered by category (Class A, B, C, Women's, Seniors) with Rank, player, Elo, Wins, Losses, Win Rate % and a trend arrow (last 30 days). Top 3 shown as a podium with gold/silver/bronze accents. Live updates via socket.
- **Head-to-Head:** choose two players → side-by-side comparison: H2H record, win rate, current Elo, an Elo history line chart for both, last 5 meetings with scores, and surface split (Har-Tru vs Saibro).

## 6. Court Maintenance & Rain Mode (admin)
- Toggle per court (or "all Har-Tru" / "all Saibro" / "all courts") with reason `RAIN` | `MAINTENANCE`, start and optional end time.
- While frozen: no new bookings or lessons; affected bookings and lessons are listed for the admin with bulk cancel; impacted members and coaches get a notification plus a global alert banner until the freeze ends.
- Unfreeze → banner disappears and slots animate back to available.

## 7. Notifications
- `Notification` model (type, payload, readAt) + in-app notification center (bell with animated badge counter) + real-time push over socket. Keep a `NotificationChannel` interface ready for Web Push/Capacitor Push later.

---

# DATA MODEL (Prisma)
At minimum: `User` (role), `ValidMembershipId`, `Coach`, `CoachCourt` (allowed courts), `Court` (name, surface `HARTRU|SAIBRO`, status), `TimeSlot` (start time, duration 75, order), `LessonSeries`, `Lesson`, `LessonAuditLog`, `Booking` (+ `BookingPlayer` join with confirmation status), `SlotFavorite`, `CourtFreeze`, `Match` (+ `MatchPlayer` with team side, + `MatchSet`), `EloHistory` (user, match, before, after, delta), `GuestPass` (+ `GuestBlock`, `GateScanLog`), `Notification`.
Use enums, proper indexes, unique constraints for slot collisions (shared between bookings and lessons) and explicit `onDelete` rules.
The seed includes: the 6 courts, the 8 slots, the 3 coaches with their allowed courts, the lesson series from the template table, an admin and a gate account, ~30 fake members across categories, and a few confirmed matches so the leaderboard and H2H have data.

---

# DELIVERABLES — generate in this order, complete code with no placeholders or "TODO: implement"

> **Superseded** by [`docs/PHASES.md`](PHASES.md). Do not follow this list.

1. **Monorepo setup:** structure, `package.json`s, Turborepo, `docker-compose.yml` (Postgres), `.env.example`, README with setup commands
2. **`schema.prisma` + seed**
3. **`packages/shared`:** Zod schemas, Elo function + tests, score validator + tests, slot grid
4. **Backend (NestJS):** modules/controllers/services/DTOs for auth (role-based guards), courts/schedule (availability endpoint merging slots + lessons + bookings + freezes), bookings, coach (agenda, create/cancel/edit lesson, series generation job, copy week), matches (report/approve/dispute), ranking/leaderboard/H2H, guests + gate validation, admin (freeze, coaches, disputes, guest history), notifications, socket gateway
5. **Frontend design foundation:** Tailwind theme tokens, fonts, `lib/motion.ts`, app shells per role (bottom nav + sidebar), shared animated components (NumberTicker, SwipeCard, Skeleton, Sheet, AlertBanner, SlotChip)
6. **Screens:**
   - Member: Login/Register, Dashboard (Elo hero + sparkline, upcoming bookings, pending confirmations, pending result approvals), Court Calendar, Booking sheet, Report Result, Match detail (approve/dispute), Leaderboard, H2H, Guest Passes + QR
   - Coach: Agenda, Add/Edit Lesson sheet, Profile
   - Gate: QR scanner + result screen
   - Admin: court freeze, coach & lesson management, dispute queue, guest history

If the output is too long for one response, stop at the end of a numbered deliverable and wait for me to say "continue". Never truncate a file in the middle.
