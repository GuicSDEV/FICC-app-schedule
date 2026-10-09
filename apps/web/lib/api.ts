import type {
  ActiveFreeze,
  AdminGuestPassItem,
  AdminMemberItem,
  AdminTimeSlotItem,
  Announcement,
  ApiErrorBody,
  AuditLogItem,
  AuditQuery,
  AuthUser,
  AutoScheduleInput,
  AutoScheduleResult,
  BookingDetail,
  CancelAffectedRequest,
  CancelLessonResult,
  CategoryItem,
  CheckInRequest,
  CheckInView,
  CircuitDetail,
  CircuitInput,
  CircuitSummary,
  ClubInfo,
  CoachAdminItem,
  CoachProfile,
  CopyWeekResult,
  CourtsNow,
  CourtsResponse,
  CreateBookingInput,
  CreateCoachInput,
  CreateFreezeInput,
  CreateGuestPassRequest,
  CreateLessonInput,
  CreateLessonResult,
  CreateStaffInput,
  CreateTimeSlotInput,
  CreateTournamentRequest,
  DocumentGuestStats,
  DrawView,
  EloPoint,
  EntrySummary,
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
  ManageEntryInput,
  MatchDetail,
  MemberNoShows,
  MembershipImportResult,
  MyBookingsResponse,
  MyMatchesResponse,
  MyTournamentItem,
  NewsPostItem,
  NewsPostRequest,
  NoShowItem,
  NotificationsResponse,
  OrderOfPlay,
  OrganizerEntryRequest,
  PendingResults,
  PendingSignup,
  PlayerProfile,
  PlayerSummary,
  PlayerTitle,
  PublicTournament,
  QueueEntryView,
  RegisterEntryRequest,
  RegisterInput,
  ReportMatchRequest,
  ResolveDisputeRequest,
  ScheduleBoard,
  ScheduleDay,
  ScheduleExceptionItem,
  ScheduleExceptionRequest,
  ScheduleMatchInput,
  SetScore,
  SignupDecisionInput,
  SignupStatusResponse,
  SlotFavoriteInput,
  SlotFavoriteItem,
  SlotHoldInput,
  PartnerRequestItem,
  CreatePartnerRequestInput,
  SlotHoldView,
  StaffMemberItem,
  StaffRoleItem,
  StaffRoleRequest,
  Surface,
  TournamentCategoryRequest,
  TournamentDetail,
  TournamentListQuery,
  TournamentOutcomeRequest,
  TournamentStatus,
  TournamentSummary,
  UpdateCircuitInput,
  UpdateClubSettingsInput,
  UpdateCoachInput,
  UpdateEntryInput,
  UpdateLessonInput,
  UpdateNewsPostInput,
  UpdateTournamentRequest,
} from "@ficc/shared";

/** Base URL of the API (the web app calls it directly with cookies). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Versioned path prefix of every API route. */
export const API_PREFIX = "/api/v1";

/** Error thrown for non-2xx responses; `message` is in the club's language and safe to show. */
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry on 401 (auth endpoints). */
  noRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for new tokens once, even if many requests 401 together. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${API_PREFIX}${path}`);
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
    // The UI shows its own (translated) text for this code.
    throw new ApiError(0, "NETWORK_ERROR", "");
  });
  if (response.status === 401 && !options.noRefresh && (await refreshSession())) {
    response = await send();
  }
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(response.status, body.code ?? "ERROR", body.message ?? "", body.details);
  }
  return data as T;
}

const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body });
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ?? {} });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body });

/** One function per endpoint, typed with the shared DTOs. */
export const api = {
  auth: {
    me: () => request<AuthUser>("/auth/me"),
    login: (input: LoginInput) =>
      request<AuthUser>("/auth/login", { method: "POST", body: input, noRefresh: true }),
    /** A member, or { status: "PENDING" } when the club approves sign-ups first. */
    register: (input: RegisterInput) =>
      request<AuthUser | SignupStatusResponse>("/auth/register", {
        method: "POST",
        body: input,
        noRefresh: true,
      }),
    logout: () => request<void>("/auth/logout", { method: "POST", noRefresh: true }),
  },
  club: () => request<ClubInfo>("/club", { noRefresh: true }),
  categories: () => request<CategoryItem[]>("/categories"),
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
    markNoShow: (id: string, userId: string, note?: string) =>
      post<NoShowItem>(`/bookings/${id}/no-shows`, { userId, note }),
    staffCancel: (id: string) => post<BookingDetail>(`/bookings/${id}/staff-cancel`),
  },
  slotHolds: {
    claim: (input: SlotHoldInput) => post<SlotHoldView>("/slot-holds", input),
    /** Null when the member keeps nothing (the API answers an empty body). */
    mine: async () => {
      const view = await request<SlotHoldView | Record<string, never>>("/slot-holds/mine");
      return view && "status" in view ? (view as SlotHoldView) : null;
    },
    release: () => request<void>("/slot-holds", { method: "DELETE" }),
  },
  partnerRequests: {
    list: (date: string) => request<PartnerRequestItem[]>("/partner-requests", { query: { date } }),
    create: (input: CreatePartnerRequestInput) =>
      post<PartnerRequestItem>("/partner-requests", input),
    cancel: (id: string) => request<void>(`/partner-requests/${id}`, { method: "DELETE" }),
  },
  scheduleExceptions: {
    list: (from: string, to: string) =>
      request<ScheduleExceptionItem[]>("/schedule-exceptions", { query: { from, to } }),
    save: (input: ScheduleExceptionRequest) =>
      put<ScheduleExceptionItem>("/schedule-exceptions", input),
    remove: (id: string) => request<void>(`/schedule-exceptions/${id}`, { method: "DELETE" }),
  },
  freePlay: {
    now: () => request<CourtsNow>("/free-play/now"),
    checkIn: (input: CheckInRequest) => post<CheckInView>("/free-play/check-ins", input),
    checkOut: (id: string) => post<void>(`/free-play/check-ins/${id}/check-out`),
    join: () => post<QueueEntryView>("/free-play/queue"),
    leave: () => request<void>("/free-play/queue", { method: "DELETE" }),
  },
  news: {
    list: () => request<NewsPostItem[]>("/news"),
    create: (input: NewsPostRequest) => post<NewsPostItem>("/news", input),
    update: (id: string, input: UpdateNewsPostInput) => patch<NewsPostItem>(`/news/${id}`, input),
    remove: (id: string) => request<void>(`/news/${id}`, { method: "DELETE" }),
    react: (id: string) => post<NewsPostItem>(`/news/${id}/react`),
    read: (id: string) => post<void>(`/news/${id}/read`),
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
    leaderboard: (category?: string) =>
      request<LeaderboardResponse>("/leaderboard", { query: { category } }),
    profile: (id: string) => request<PlayerProfile>(`/players/${id}`),
    eloHistory: (id: string) => request<EloPoint[]>(`/players/${id}/elo-history`),
    h2h: (a: string, b: string) => request<H2HResponse>("/h2h", { query: { a, b } }),
  },
  guests: {
    mine: () => request<GuestPassItem[]>("/guest-passes"),
    create: (input: CreateGuestPassRequest) => post<GuestPassItem>("/guest-passes", input),
    cancel: (id: string) => post<GuestPassItem>(`/guest-passes/${id}/cancel`),
  },
  tournaments: {
    list: (query: TournamentListQuery = {}) =>
      request<TournamentSummary[]>("/tournaments", { query }),
    mine: () => request<MyTournamentItem[]>("/tournaments/mine"),
    get: (id: string) => request<TournamentDetail>(`/tournaments/${id}`),
    create: (input: CreateTournamentRequest) => post<TournamentDetail>("/tournaments", input),
    update: (id: string, input: UpdateTournamentRequest) =>
      patch<TournamentDetail>(`/tournaments/${id}`, input),
    setStatus: (id: string, status: TournamentStatus) =>
      post<TournamentDetail>(`/tournaments/${id}/status`, { status }),
    setOrganizers: (id: string, userIds: string[]) =>
      put<TournamentDetail>(`/tournaments/${id}/organizers`, { userIds }),
    duplicate: (id: string) => post<TournamentDetail>(`/tournaments/${id}/duplicate`),
    addCategory: (id: string, input: TournamentCategoryRequest) =>
      post<TournamentDetail>(`/tournaments/${id}/categories`, input),
    updateCategory: (id: string, categoryId: string, input: TournamentCategoryRequest) =>
      patch<TournamentDetail>(`/tournaments/${id}/categories/${categoryId}`, input),
    deleteCategory: (id: string, categoryId: string) =>
      request<TournamentDetail>(`/tournaments/${id}/categories/${categoryId}`, {
        method: "DELETE",
      }),
    register: (id: string, categoryId: string, input: RegisterEntryRequest) =>
      post<EntrySummary>(`/tournaments/${id}/categories/${categoryId}/entries`, input),
    addEntry: (id: string, categoryId: string, input: OrganizerEntryRequest) =>
      post<EntrySummary>(`/tournaments/${id}/categories/${categoryId}/entries/manual`, input),
    entries: (id: string) => request<EntrySummary[]>(`/tournaments/${id}/entries`),
    entriesCsvUrl: (id: string) => `${API_URL}${API_PREFIX}/tournaments/${id}/entries.csv`,
    draw: (id: string, categoryId: string) =>
      request<DrawView>(`/tournaments/${id}/draws/${categoryId}`),
    generateDraw: (id: string, categoryId: string) =>
      post<DrawView>(`/tournaments/${id}/draws/${categoryId}/generate`),
    swapDraw: (id: string, categoryId: string, entryA: string, entryB: string) =>
      post<DrawView>(`/tournaments/${id}/draws/${categoryId}/swap`, { entryA, entryB }),
    publishDraw: (id: string, categoryId: string) =>
      post<DrawView>(`/tournaments/${id}/draws/${categoryId}/publish`),
    orderOfPlay: (id: string) => request<OrderOfPlay[]>(`/tournaments/${id}/order-of-play`),
    publishDay: (id: string, date: string) =>
      post<void>(`/tournaments/${id}/order-of-play/publish`, { date }),
    board: (id: string, date: string) =>
      request<ScheduleBoard>(`/tournaments/${id}/schedule-board`, { query: { date } }),
    autoSchedule: (id: string, input: AutoScheduleInput) =>
      post<AutoScheduleResult>(`/tournaments/${id}/auto-schedule`, input),
    rescheduleFrozen: (id: string, input: AutoScheduleInput) =>
      post<AutoScheduleResult & { moved: number }>(`/tournaments/${id}/reschedule-frozen`, input),
    pending: (id: string) => request<PendingResults>(`/tournaments/${id}/pending-results`),
    announcements: (id: string) => request<Announcement[]>(`/tournaments/${id}/announcements`),
    announce: (id: string, input: { body: string; categoryId?: string }) =>
      post<Announcement[]>(`/tournaments/${id}/announcements`, input),
    public: (publicId: string) =>
      request<PublicTournament>(`/public/tournaments/${publicId}`, { noRefresh: true }),
  },
  tournamentEntries: {
    accept: (id: string) => post<EntrySummary>(`/tournament-entries/${id}/accept`),
    decline: (id: string) => post<void>(`/tournament-entries/${id}/decline`),
    withdraw: (id: string) => post<void>(`/tournament-entries/${id}/withdraw`),
    update: (id: string, input: UpdateEntryInput) =>
      patch<EntrySummary>(`/tournament-entries/${id}`, input),
    manage: (id: string, input: ManageEntryInput) =>
      patch<EntrySummary>(`/tournament-entries/${id}/manage`, input),
  },
  tournamentMatches: {
    schedule: (id: string, input: ScheduleMatchInput) =>
      post<void>(`/tournament-matches/${id}/schedule`, input),
    unschedule: (id: string) =>
      request<void>(`/tournament-matches/${id}/schedule`, { method: "DELETE" }),
    report: (id: string, sets: SetScore[]) =>
      post<void>(`/tournament-matches/${id}/result`, { sets }),
    confirm: (id: string) => post<void>(`/tournament-matches/${id}/confirm`),
    outcome: (id: string, input: TournamentOutcomeRequest) =>
      post<void>(`/tournament-matches/${id}/outcome`, input),
  },
  circuits: {
    list: () => request<CircuitSummary[]>("/circuits"),
    get: (id: string) => request<CircuitDetail>(`/circuits/${id}`),
    create: (input: CircuitInput) => post<CircuitDetail>("/circuits", input),
    update: (id: string, input: UpdateCircuitInput) =>
      patch<CircuitDetail>(`/circuits/${id}`, input),
  },
  titles: (playerId: string) => request<PlayerTitle[]>(`/players/${playerId}/titles`),
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
    members: (q?: string, status?: "PENDING" | "ACTIVE" | "REJECTED") =>
      request<AdminMemberItem[]>("/admin/members", { query: { q, status } }),
    pendingMembers: () => request<PendingSignup[]>("/admin/members/pending"),
    decideMember: (id: string, input: SignupDecisionInput) =>
      post<void>(`/admin/members/${id}/decision`, input),
    memberNoShows: (id: string) => request<MemberNoShows>(`/admin/members/${id}/no-shows`),
    updateSettings: (input: UpdateClubSettingsInput) => patch<ClubInfo>("/admin/settings", input),
    timeSlots: () => request<AdminTimeSlotItem[]>("/admin/time-slots"),
    createTimeSlot: (input: CreateTimeSlotInput) =>
      post<AdminTimeSlotItem>("/admin/time-slots", input),
    setTimeSlotActive: (id: string, isActive: boolean) =>
      patch<AdminTimeSlotItem>(`/admin/time-slots/${id}`, { isActive }),
    roles: () => request<StaffRoleItem[]>("/admin/staff/roles"),
    createRole: (input: StaffRoleRequest) => post<StaffRoleItem>("/admin/staff/roles", input),
    updateRole: (id: string, input: StaffRoleRequest) =>
      put<StaffRoleItem>(`/admin/staff/roles/${id}`, input),
    deleteRole: (id: string) => request<void>(`/admin/staff/roles/${id}`, { method: "DELETE" }),
    staff: () => request<StaffMemberItem[]>("/admin/staff"),
    createStaff: (input: CreateStaffInput) => post<StaffMemberItem>("/admin/staff", input),
    setStaffRoles: (id: string, roleIds: string[]) =>
      put<StaffMemberItem>(`/admin/staff/${id}/roles`, { roleIds }),
    setStaffActive: (id: string, isActive: boolean) =>
      patch<StaffMemberItem>(`/admin/staff/${id}/active`, { isActive }),
    auditLog: (query: AuditQuery = {}) => request<AuditLogItem[]>("/admin/audit", { query }),
    importMemberships: (csv: string) =>
      post<MembershipImportResult>("/admin/memberships/import", { csv }),
  },
};
