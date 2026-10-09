import type {
  ActiveFreeze,
  AdminGuestPassItem,
  AdminMemberItem,
  ApiErrorBody,
  AuthUser,
  BookingDetail,
  CancelAffectedRequest,
  CancelLessonResult,
  Category,
  CoachAdminItem,
  CoachProfile,
  CopyWeekResult,
  CourtsResponse,
  CreateBookingInput,
  CreateCoachInput,
  CreateFreezeInput,
  CreateLessonInput,
  CreateLessonResult,
  DocumentGuestStats,
  EloPoint,
  FreezeDetail,
  GatePassView,
  GateScanLogItem,
  GateScanResponse,
  GuestBlockItem,
  GuestPassItem,
  H2HResponse,
  HostGuestStats,
  LeaderboardResponse,
  LessonAuditItem,
  LessonCancelScope,
  LessonDetail,
  LoginInput,
  MatchDetail,
  MembershipImportResult,
  MyBookingsResponse,
  MyMatchesResponse,
  NotificationsResponse,
  PlayerProfile,
  PlayerSummary,
  RegisterInput,
  ReportMatchRequest,
  ResolveDisputeRequest,
  ScheduleDay,
  SlotFavoriteInput,
  SlotFavoriteItem,
  Surface,
  UpdateCoachInput,
  UpdateLessonInput,
} from "@ficc/shared";

/** Base URL of the API (the web app calls it directly with cookies). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Error thrown for non-2xx responses; `message` is pt-BR and safe to show. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry on 401 (auth endpoints). */
  noRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for new tokens once, even if many requests 401 together. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/api/auth/refresh`, { method: "POST", credentials: "include" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}/api${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Typed fetch against the API with cookie auth and transparent token refresh. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      credentials: "include",
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let response = await send().catch(() => {
    throw new ApiError(0, "NETWORK_ERROR", "Sem conexão com o servidor. Verifique sua internet.");
  });
  if (response.status === 401 && !options.noRefresh && (await refreshSession())) {
    response = await send();
  }
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      response.status,
      body.code ?? "ERROR",
      body.message ?? "Algo deu errado. Tente novamente.",
      body.details,
    );
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ?? {} });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body });

/** One function per endpoint, typed with the shared DTOs. */
export const api = {
  auth: {
    me: () => request<AuthUser>("/auth/me"),
    login: (input: LoginInput) =>
      request<AuthUser>("/auth/login", { method: "POST", body: input, noRefresh: true }),
    register: (input: RegisterInput) =>
      request<AuthUser>("/auth/register", { method: "POST", body: input, noRefresh: true }),
    logout: () => request<void>("/auth/logout", { method: "POST", noRefresh: true }),
  },
  courts: () => request<CourtsResponse>("/courts"),
  schedule: (date: string, surface?: Surface) =>
    request<ScheduleDay>("/schedule", { query: { date, surface } }),
  freezes: { active: () => request<ActiveFreeze[]>("/freezes/active") },
  coaches: { profile: (id: string) => request<CoachProfile>(`/coaches/${id}`) },
  members: { search: (q: string) => request<PlayerSummary[]>("/members/search", { query: { q } }) },
  bookings: {
    mine: () => request<MyBookingsResponse>("/bookings/mine"),
    get: (id: string) => request<BookingDetail>(`/bookings/${id}`),
    create: (input: CreateBookingInput) => post<BookingDetail>("/bookings", input),
    confirm: (id: string) => post<BookingDetail>(`/bookings/${id}/confirm`),
    decline: (id: string) => post<BookingDetail>(`/bookings/${id}/decline`),
    cancel: (id: string) => post<BookingDetail>(`/bookings/${id}/cancel`),
  },
  favorites: {
    list: () => request<SlotFavoriteItem[]>("/favorites"),
    add: (input: SlotFavoriteInput) => post<SlotFavoriteItem>("/favorites", input),
    remove: (input: SlotFavoriteInput) =>
      request<void>("/favorites", { method: "DELETE", body: input }),
  },
  notifications: {
    list: () => request<NotificationsResponse>("/notifications"),
    read: (id: string) => post<void>(`/notifications/${id}/read`),
    readAll: () => post<void>("/notifications/read-all"),
  },
  matches: {
    mine: () => request<MyMatchesResponse>("/matches/mine"),
    get: (id: string) => request<MatchDetail>(`/matches/${id}`),
    report: (input: ReportMatchRequest) => post<MatchDetail>("/matches", input),
    approve: (id: string) => post<MatchDetail>(`/matches/${id}/approve`),
    dispute: (id: string, comment?: string) =>
      post<MatchDetail>(`/matches/${id}/dispute`, { comment }),
  },
  ranking: {
    leaderboard: (category?: Category) =>
      request<LeaderboardResponse>("/leaderboard", { query: { category } }),
    profile: (id: string) => request<PlayerProfile>(`/players/${id}`),
    eloHistory: (id: string) => request<EloPoint[]>(`/players/${id}/elo-history`),
    h2h: (a: string, b: string) => request<H2HResponse>("/h2h", { query: { a, b } }),
  },
  guests: {
    mine: () => request<GuestPassItem[]>("/guest-passes"),
    create: (input: {
      guestName: string;
      documentType: "CPF" | "RG";
      documentNumber: string;
      visitDate: string;
      bookingId?: string;
    }) => post<GuestPassItem>("/guest-passes", input),
    cancel: (id: string) => post<GuestPassItem>(`/guest-passes/${id}/cancel`),
  },
  gate: {
    scan: (token: string) => post<GateScanResponse>("/gate/scan", { token }),
    search: (document: string) => request<GatePassView[]>("/gate/passes", { query: { document } }),
    checkIn: (id: string) => post<GateScanResponse>(`/gate/passes/${id}/check-in`),
    scans: () => request<GateScanLogItem[]>("/gate/scans"),
  },
  coach: {
    agenda: (date: string) => request<ScheduleDay>("/coach/agenda", { query: { date } }),
    lessons: (from: string, to: string) =>
      request<LessonDetail[]>("/coach/lessons", { query: { from, to } }),
    createLesson: (input: CreateLessonInput) => post<CreateLessonResult>("/coach/lessons", input),
    updateLesson: (id: string, input: UpdateLessonInput) =>
      patch<LessonDetail>(`/coach/lessons/${id}`, input),
    cancelLesson: (id: string, scope: LessonCancelScope) =>
      post<CancelLessonResult>(`/coach/lessons/${id}/cancel`, { scope }),
    restoreLesson: (id: string) => post<LessonDetail>(`/coach/lessons/${id}/restore`),
    copyWeek: (weekStart: string) =>
      post<CopyWeekResult>("/coach/lessons/copy-week", { weekStart }),
  },
  admin: {
    coaches: () => request<CoachAdminItem[]>("/admin/coaches"),
    createCoach: (input: CreateCoachInput) => post<CoachAdminItem>("/admin/coaches", input),
    updateCoach: (id: string, input: UpdateCoachInput) =>
      patch<CoachAdminItem>(`/admin/coaches/${id}`, input),
    lessons: (from: string, to: string, coachId?: string) =>
      request<LessonDetail[]>("/admin/lessons", { query: { from, to, coachId } }),
    createLesson: (input: CreateLessonInput) => post<CreateLessonResult>("/admin/lessons", input),
    updateLesson: (id: string, input: UpdateLessonInput) =>
      patch<LessonDetail>(`/admin/lessons/${id}`, input),
    cancelLesson: (id: string, scope: LessonCancelScope) =>
      post<CancelLessonResult>(`/admin/lessons/${id}/cancel`, { scope }),
    restoreLesson: (id: string) => post<LessonDetail>(`/admin/lessons/${id}/restore`),
    audit: (query: { lessonId?: string; coachId?: string; limit?: number } = {}) =>
      request<LessonAuditItem[]>("/admin/lessons/audit", { query }),
    freezes: () => request<FreezeDetail[]>("/admin/freezes"),
    freeze: (id: string) => request<FreezeDetail>(`/admin/freezes/${id}`),
    createFreeze: (input: CreateFreezeInput) => post<FreezeDetail>("/admin/freezes", input),
    cancelAffected: (id: string, input: CancelAffectedRequest) =>
      post<FreezeDetail>(`/admin/freezes/${id}/cancel-affected`, input),
    liftFreeze: (id: string) => post<FreezeDetail>(`/admin/freezes/${id}/lift`),
    disputes: () => request<MatchDetail[]>("/admin/disputes"),
    resolveDispute: (id: string, input: ResolveDisputeRequest) =>
      post<MatchDetail>(`/admin/disputes/${id}/resolve`, input),
    guestHosts: () => request<HostGuestStats[]>("/admin/guests/hosts"),
    guestDocuments: () => request<DocumentGuestStats[]>("/admin/guests/documents"),
    guestPasses: (query: { hostId?: string; documentOf?: string }) =>
      request<AdminGuestPassItem[]>("/admin/guests/passes", { query }),
    guestBlocks: () => request<GuestBlockItem[]>("/admin/guests/blocks"),
    blockFromPass: (passId: string, reason?: string) =>
      post<GuestBlockItem>(`/admin/guests/blocks/from-pass/${passId}`, { reason }),
    liftBlock: (id: string) => request<void>(`/admin/guests/blocks/${id}`, { method: "DELETE" }),
    suspendGuests: (memberId: string, reason: string) =>
      post<void>(`/admin/guests/suspensions/${memberId}`, { reason }),
    unsuspendGuests: (memberId: string) =>
      request<void>(`/admin/guests/suspensions/${memberId}`, { method: "DELETE" }),
    members: (q?: string) => request<AdminMemberItem[]>("/admin/members", { query: { q } }),
    importMemberships: (csv: string) =>
      post<MembershipImportResult>("/admin/memberships/import", { csv }),
  },
};
