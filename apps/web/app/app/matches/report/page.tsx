"use client";

import {
  addDays,
  type BookingDetail,
  clubToday,
  type MatchFormat,
  type PlayerSummary,
  reportMatchSchema,
  type ReportMatchRequest,
  type SetScore,
  sportRules,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Stepper } from "@/components/matches/set-stepper";
import { MemberPicker } from "@/components/members/member-picker";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { fadeVariants, haptic, listItemVariants, popVariants, spring, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

type ThirdSet = "none" | "regular" | "tiebreak";

const EMPTY_SET = { a: 0, b: 0 };
/** Stepper limits: games in a regular set, points in a match tie-break. */
const MAX_GAMES = 7;
const MAX_TIEBREAK = 30;

function toPlayer(user: { id: string; name: string } & Partial<PlayerSummary>): PlayerSummary {
  return {
    id: user.id,
    name: user.name,
    membershipId: user.membershipId ?? null,
    photoUrl: user.photoUrl ?? null,
    elo: user.elo ?? 0,
    categories: user.categories ?? [],
  };
}

/** Chip to start the report from a booking that just ended (prefills players, date, court). */
function BookingChip({
  booking,
  selected,
  onSelect,
}: {
  booking: BookingDetail;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("report");
  const format = useFormat();
  const { user } = useSession();
  const others = booking.players
    .filter((player) => player.user.id !== user?.id)
    .map((player) => player.user.name.split(" ")[0])
    .join(", ");
  return (
    <motion.button
      type="button"
      whileTap={tap}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-1 rounded-lg border p-3 text-left transition-tokens",
        selected ? "border-primary bg-ball-soft" : "border-border bg-card hover:bg-surface-2",
      )}
    >
      <span className="flex items-center gap-2 text-small font-semibold">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            booking.court.surface === "HARTRU" ? "bg-hartru" : "bg-saibro",
          )}
        />
        {booking.court.name} · <span className="num">{booking.slot.startTime}</span>
        {selected ? <Check className="ml-auto size-4 text-ball-ink" /> : null}
      </span>
      <span className="text-caption text-muted-foreground">
        {format.dayTitle(booking.date)} · {t("with", { names: others })}
      </span>
    </motion.button>
  );
}

export default function ReportMatchPage() {
  const t = useTranslations("report");
  const common = useTranslations("common");
  const labels = useTranslations("labels");
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const client = useQueryClient();
  const club = useClub();
  const { user } = useSession();
  const bookings = useQuery({ queryKey: queryKeys.bookingsMine, queryFn: api.bookings.mine });
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });

  const today = club ? clubToday(new Date(), club.timezone) : null;
  const earliest = today && club ? addDays(today, -club.settings.matchReportMaxDaysAgo) : undefined;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [format, setFormat] = useState<MatchFormat>("SINGLES");
  const [partner, setPartner] = useState<PlayerSummary[]>([]);
  const [opponents, setOpponents] = useState<PlayerSummary[]>([]);
  const [playedOn, setPlayedOn] = useState<string>("");
  const [courtId, setCourtId] = useState<string | null>(null);
  const [sets, setSets] = useState<[typeof EMPTY_SET, typeof EMPTY_SET, typeof EMPTY_SET]>([
    EMPTY_SET,
    EMPTY_SET,
    EMPTY_SET,
  ]);
  const [third, setThird] = useState<ThirdSet>("none");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const date = playedOn || today || "";
  const sport = club?.settings.primarySport ?? "TENNIS";
  const rules = sportRules(sport);

  // Sets 1 and 2 decide whether a third is needed.
  const firstTwo = sets.slice(0, 2).map((set) => rules.setWinner({ ...set, tiebreak: false }));
  const split = firstTwo[0] !== null && firstTwo[1] !== null && firstTwo[0] !== firstTwo[1];
  const effectiveThird: ThirdSet = split ? (third === "none" ? "regular" : third) : "none";
  const score: SetScore[] = [
    { ...sets[0], tiebreak: false },
    { ...sets[1], tiebreak: false },
    ...(effectiveThird === "none" ? [] : [{ ...sets[2], tiebreak: effectiveThird === "tiebreak" }]),
  ];
  const scoreCheck = rules.scoreSchema.safeParse(score);
  const scoreIssue = scoreCheck.success ? null : issueMessage(scoreCheck.error.issues[0]);

  const sideA = user ? [user.id, ...partner.map((player) => player.id)] : [];
  const request: ReportMatchRequest = {
    format,
    sideA,
    sideB: opponents.map((player) => player.id),
    score,
    playedOn: date,
    ...(booking ? { bookingId: booking.id } : courtId ? { courtId } : {}),
  };
  const formCheck = reportMatchSchema.safeParse(request);
  const formIssue = formCheck.success ? null : issueMessage(formCheck.error.issues[0]);
  const teamSize = rules.teamSize[format];
  const playersMissing = teamSize - 1 - partner.length + (teamSize - opponents.length);

  const recent = bookings.data?.recent ?? [];
  const bookingPlayers = useMemo(
    () =>
      booking
        ? booking.players
            .filter((player) => player.user.id !== user?.id)
            .map((player) => player.user)
        : [],
    [booking, user],
  );

  function chooseBooking(next: BookingDetail) {
    if (booking?.id === next.id) {
      setBooking(null);
      return;
    }
    setBooking(next);
    setFormat(next.type);
    setPlayedOn(next.date);
    setCourtId(next.court.id);
    const others = next.players.filter((player) => player.user.id !== user?.id);
    if (next.type === "SINGLES") {
      setPartner([]);
      setOpponents(others.map((player) => player.user));
    } else {
      // Doubles: the member says who their partner was; everyone else is on the other side.
      setPartner([]);
      setOpponents([]);
    }
    setSubmitError(null);
  }

  function choosePartnerFromBooking(player: PlayerSummary) {
    setPartner([player]);
    setOpponents(bookingPlayers.filter((other) => other.id !== player.id));
  }

  function changeFormat(next: MatchFormat) {
    setFormat(next);
    setPartner([]);
    setOpponents((current) => current.slice(0, rules.teamSize[next]));
  }

  function setGames(index: 0 | 1 | 2, side: "a" | "b", value: number) {
    setTouched(true);
    setSubmitError(null);
    setSets((current) => {
      const next = [...current] as typeof current;
      next[index] = { ...next[index], [side]: value };
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => api.matches.report(request),
    onSuccess: (match) => {
      haptic([12, 40, 12]);
      toast.success(t("sent"), { description: t("sentDescription") });
      client.setQueryData(queryKeys.match(match.id), match);
      void client.invalidateQueries({ queryKey: queryKeys.matchesMine });
      void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
      router.replace(`/app/matches?m=${match.id}`);
    },
    onError: (failure) => {
      const message = errorMessage(failure, t("failed"));
      setSubmitError(message);
      toast.error(message);
    },
  });

  function submit() {
    setTouched(true);
    if (!formCheck.success || !scoreCheck.success) return;
    mutation.mutate();
  }

  const winner = scoreCheck.success ? scoreCheck.data.winner : null;
  const setLabel = (index: number) =>
    index === 2 && effectiveThird === "tiebreak" ? t("tiebreak") : t("set", { number: index + 1 });

  const courtList = courts.data?.courts ?? [];

  return (
    <>
      <PageHeader title={t("title")} leading={<BackButton fallback="/app/matches" />} />
      <div className="mx-auto mt-5 max-w-xl space-y-8 pb-4">
        {recent.length > 0 ? (
          <section className="space-y-3" aria-label={t("fromBooking")}>
            <SectionLabel>{t("fromBooking")}</SectionLabel>
            <div className="-mx-4 no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
              {recent.map((entry) => (
                <BookingChip
                  key={entry.id}
                  booking={entry}
                  selected={booking?.id === entry.id}
                  onSelect={() => chooseBooking(entry)}
                />
              ))}
            </div>
          </section>
        ) : bookings.isLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : null}

        <section className="space-y-4" aria-label={t("players")}>
          <SectionLabel>{t("players")}</SectionLabel>
          <SegmentedControl
            label={t("formatLabel")}
            options={[
              { value: "SINGLES", label: common("singles") },
              { value: "DOUBLES", label: common("doubles") },
            ]}
            value={format}
            onChange={(next) => !booking && changeFormat(next)}
            className={cn(booking && "pointer-events-none opacity-60")}
          />

          {booking && booking.type === "DOUBLES" ? (
            <div className="space-y-2">
              <Label>{t("whoWasPartner")}</Label>
              <div className="flex flex-wrap gap-2">
                {bookingPlayers.map((player) => {
                  const selected = partner[0]?.id === player.id;
                  return (
                    <motion.button
                      key={player.id}
                      type="button"
                      whileTap={tap}
                      aria-pressed={selected}
                      onClick={() => choosePartnerFromBooking(player)}
                      className={cn(
                        "inline-flex h-11 items-center gap-2 rounded-full border pr-4 pl-1.5 text-small font-medium transition-tokens",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface-2",
                      )}
                    >
                      <Avatar name={player.name} src={player.photoUrl} size="sm" />
                      {player.name.split(" ")[0]}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {booking ? (
            <TeamsPreview mine={user ? [toPlayer(user), ...partner] : partner} theirs={opponents} />
          ) : (
            <>
              {format === "DOUBLES" ? (
                <MemberPicker
                  label={t("partner")}
                  selected={partner}
                  onChange={setPartner}
                  max={1}
                  excludeIds={[...(user ? [user.id] : []), ...opponents.map((p) => p.id)]}
                />
              ) : null}
              <MemberPicker
                label={format === "SINGLES" ? t("opponent") : t("opponents")}
                selected={opponents}
                onChange={setOpponents}
                max={teamSize}
                excludeIds={[...(user ? [user.id] : []), ...partner.map((p) => p.id)]}
              />
            </>
          )}
        </section>

        <section className="space-y-4" aria-label={t("whenWhere")}>
          <SectionLabel>{t("whenWhere")}</SectionLabel>
          <div className="space-y-2">
            <Label htmlFor="played-on">{t("date")}</Label>
            <Input
              id="played-on"
              type="date"
              value={date}
              min={earliest}
              max={today ?? undefined}
              disabled={Boolean(booking)}
              onChange={(event) => setPlayedOn(event.target.value)}
              className="num"
            />
          </div>
          {booking ? null : (
            <div className="space-y-2">
              <Label>{t("court")}</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {courts.isLoading
                  ? [0, 1, 2, 3, 4, 5].map((key) => (
                      <Skeleton key={key} className="h-14 rounded-md" />
                    ))
                  : courtList.map((court) => {
                      const selected = courtId === court.id;
                      return (
                        <motion.button
                          key={court.id}
                          type="button"
                          whileTap={tap}
                          aria-pressed={selected}
                          onClick={() => setCourtId(court.id)}
                          className={cn(
                            "flex h-14 flex-col items-center justify-center rounded-md border text-small font-semibold transition-tokens",
                            selected
                              ? court.surface === "HARTRU"
                                ? "border-hartru bg-hartru text-white"
                                : "border-saibro bg-saibro text-white"
                              : "border-border bg-surface-2 hover:bg-surface-3",
                          )}
                        >
                          {court.name}
                          <span className="text-[0.625rem] font-medium uppercase opacity-80">
                            {labels(`surface.${court.surface}`)}
                          </span>
                        </motion.button>
                      );
                    })}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4" aria-label={t("score")}>
          <div className="flex items-center justify-between">
            <SectionLabel>{t("score")}</SectionLabel>
            <span className="text-caption text-muted-foreground">{t("bestOf3")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 text-center text-caption font-medium text-muted-foreground">
            <span>{t("yourSide")}</span>
            <span>{t("theirSide")}</span>
          </div>
          <ul className="space-y-3">
            {([0, 1, 2] as const).map((index) => {
              const visible = index < 2 || effectiveThird !== "none";
              if (!visible) return null;
              const set = sets[index];
              const tiebreak = index === 2 && effectiveThird === "tiebreak";
              const setWinner = rules.setWinner({ ...set, tiebreak });
              return (
                <motion.li
                  key={index}
                  custom={index}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-2 rounded-lg border border-border bg-card p-3"
                >
                  <span className="flex items-center gap-2 text-small font-medium">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={setWinner ?? "none"}
                        variants={popVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full",
                          setWinner
                            ? "bg-ball text-on-color"
                            : "bg-surface-2 text-muted-foreground",
                        )}
                      >
                        {setWinner ? (
                          <Check className="size-3.5" />
                        ) : (
                          <span className="num text-caption">{index + 1}</span>
                        )}
                      </motion.span>
                    </AnimatePresence>
                    {setLabel(index)}
                  </span>
                  <div className="grid grid-cols-2 justify-items-center gap-2">
                    <Stepper
                      label={t("gamesLabel", { set: setLabel(index), side: t("yourSide") })}
                      value={set.a}
                      max={tiebreak ? MAX_TIEBREAK : MAX_GAMES}
                      onChange={(value) => setGames(index, "a", value)}
                      emphasis={setWinner === "A"}
                    />
                    <Stepper
                      label={t("gamesLabel", { set: setLabel(index), side: t("theirSide") })}
                      value={set.b}
                      max={tiebreak ? MAX_TIEBREAK : MAX_GAMES}
                      onChange={(value) => setGames(index, "b", value)}
                      emphasis={setWinner === "B"}
                    />
                  </div>
                </motion.li>
              );
            })}
          </ul>
          <AnimatePresence initial={false}>
            {split ? (
              <motion.div
                key="third"
                variants={fadeVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <SegmentedControl
                  label={t("thirdSetLabel")}
                  options={[
                    { value: "regular", label: t("thirdRegular") },
                    { value: "tiebreak", label: t("thirdTiebreak") },
                  ]}
                  value={effectiveThird === "tiebreak" ? "tiebreak" : "regular"}
                  onChange={(next) => {
                    setThird(next);
                    setSets((current) => [current[0], current[1], EMPTY_SET]);
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div aria-live="polite" className="min-h-12">
            <AnimatePresence mode="wait" initial={false}>
              {winner ? (
                <motion.p
                  key="winner"
                  variants={popVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={spring.snappy}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-4 py-3 text-small font-medium",
                    winner === "A" ? "bg-ball-soft text-ball-ink" : "bg-surface-2 text-foreground",
                  )}
                >
                  <CalendarCheck2 className="size-4 shrink-0" />
                  {winner === "A"
                    ? t("youWon", { score: rules.formatScore(score) })
                    : t("youLost", { score: rules.formatScore(score) })}
                </motion.p>
              ) : touched && scoreIssue ? (
                <motion.p
                  key={scoreIssue}
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex items-center gap-2 rounded-md bg-surface-2 px-4 py-3 text-small text-muted-foreground"
                >
                  <X className="size-4 shrink-0 text-danger-ink" />
                  {scoreIssue}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        <div className="space-y-2">
          <FieldError>{submitError ?? (touched && winner ? formIssue : null)}</FieldError>
          <Button
            block
            size="lg"
            loading={mutation.isPending}
            disabled={!user || !club}
            onClick={submit}
          >
            {playersMissing > 0
              ? t("choosePlayers", { count: playersMissing })
              : !winner
                ? t("fillScore")
                : t("submit")}
          </Button>
          <p className="text-center text-caption text-muted-foreground">
            {club ? t("approvalNote", { hours: club.settings.matchAutoApproveHours }) : " "}
          </p>
        </div>
      </div>
    </>
  );
}

/** Both teams as avatar rows when they come from a booking. */
function TeamsPreview({ mine, theirs }: { mine: PlayerSummary[]; theirs: PlayerSummary[] }) {
  const t = useTranslations("report");
  const common = useTranslations("common");
  const row = (players: PlayerSummary[], label: string) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div className="flex -space-x-2">
        {players.length === 0 ? (
          <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
            ?
          </span>
        ) : (
          players.map((player) => (
            <span key={player.id} className="rounded-full ring-2 ring-card">
              <Avatar name={player.name} src={player.photoUrl} />
            </span>
          ))
        )}
      </div>
      <span className="w-full truncate text-small font-medium">
        {players.length ? players.map((player) => player.name.split(" ")[0]).join(" / ") : label}
      </span>
    </div>
  );
  return (
    <motion.div
      variants={fadeVariants}
      initial="hidden"
      animate="show"
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
    >
      {row(mine, t("yourSide"))}
      <span className="font-display text-title text-muted-foreground">{common("vs")}</span>
      {row(theirs, t("theirSide"))}
    </motion.div>
  );
}
