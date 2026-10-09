import type { Surface } from "@ficc/shared";

/** Every TanStack Query key in one place, so socket events can invalidate precisely. */
export const queryKeys = {
  me: ["me"] as const,
  club: ["club"] as const,
  categories: ["categories"] as const,
  courts: ["courts"] as const,
  schedule: (date?: string, surface?: Surface) =>
    date ? (["schedule", date, surface ?? "ALL"] as const) : (["schedule"] as const),
  freezesActive: ["freezes", "active"] as const,
  bookingsMine: ["bookings", "mine"] as const,
  booking: (id: string) => ["bookings", id] as const,
  coach: (id: string) => ["coaches", id] as const,
  favorites: ["favorites"] as const,
  notifications: ["notifications"] as const,
  matchesMine: ["matches", "mine"] as const,
  match: (id: string) => ["matches", id] as const,
  leaderboard: (category?: string) =>
    category === undefined ? (["leaderboard"] as const) : (["leaderboard", category] as const),
  player: (id: string) => ["players", id] as const,
  eloHistory: (id: string) => ["players", id, "elo-history"] as const,
  h2h: (a: string, b: string) => ["h2h", a, b] as const,
  memberSearch: (q: string) => ["members", "search", q] as const,
  guestPasses: ["guest-passes"] as const,
  coachAgenda: (date?: string) =>
    date ? (["coach", "agenda", date] as const) : (["coach", "agenda"] as const),
  coachLessons: (from?: string, to?: string) =>
    from ? (["coach", "lessons", from, to] as const) : (["coach", "lessons"] as const),
  admin: {
    root: ["admin"] as const,
    coaches: ["admin", "coaches"] as const,
    lessons: (from: string, to: string, coachId?: string) =>
      ["admin", "lessons", from, to, coachId ?? "all"] as const,
    audit: ["admin", "audit"] as const,
    freezes: ["admin", "freezes"] as const,
    disputes: ["admin", "disputes"] as const,
    guestHosts: ["admin", "guests", "hosts"] as const,
    guestDocuments: ["admin", "guests", "documents"] as const,
    guestBlocks: ["admin", "guests", "blocks"] as const,
    guestPasses: (filter: string) => ["admin", "guests", "passes", filter] as const,
    members: (q: string) => ["admin", "members", q] as const,
  },
  gateScans: ["gate", "scans"] as const,
  tournaments: {
    root: ["tournaments"] as const,
    list: (filter: string) => ["tournaments", "list", filter] as const,
    mine: ["tournaments", "mine"] as const,
    detail: (id: string) => ["tournaments", id] as const,
    draw: (id: string, categoryId: string) => ["tournaments", id, "draw", categoryId] as const,
    orderOfPlay: (id: string) => ["tournaments", id, "order-of-play"] as const,
    entries: (id: string) => ["tournaments", id, "entries"] as const,
    board: (id: string, date: string) => ["tournaments", id, "board", date] as const,
    pending: (id: string) => ["tournaments", id, "pending"] as const,
  },
  circuits: ["circuits"] as const,
  circuit: (id: string) => ["circuits", id] as const,
  titles: (playerId: string) => ["players", playerId, "titles"] as const,
};
