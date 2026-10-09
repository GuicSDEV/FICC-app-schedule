import type { Category, Surface } from "@ficc/shared";

/** Every TanStack Query key in one place, so socket events can invalidate precisely. */
export const queryKeys = {
  me: ["me"] as const,
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
  leaderboard: (category?: Category) =>
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
};
