"use client";

import {
  ENTRY_STATUSES,
  type EntrySummary,
  type EntryStatus,
  type ManageEntryInput,
  NO_RESTRICTIONS,
  organizerEntrySchema,
  type OrganizerEntryRequest,
  PAYMENT_STATUSES,
  type PaymentStatus,
  type PlayerSummary,
  type TimeRestrictions,
  type TournamentDetail,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, UserPlus, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { datesBetween, ENTRY_TONE, invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";

import { RestrictionsFields } from "../restrictions-fields";
import { CategoryChips } from "../tournament-panels";

type StatusFilter = "ALL" | "PENDING" | "CONFIRMED" | "WAITLISTED" | "OUT";
const FILTERS: StatusFilter[] = ["ALL", "PENDING", "CONFIRMED", "WAITLISTED", "OUT"];
const IN_FILTER: Record<StatusFilter, EntryStatus[]> = {
  ALL: [...ENTRY_STATUSES],
  PENDING: ["PENDING_APPROVAL", "PENDING_PARTNER"],
  CONFIRMED: ["CONFIRMED"],
  WAITLISTED: ["WAITLISTED"],
  OUT: ["WITHDRAWN", "REJECTED"],
};
const PAYMENT_TONE: Record<PaymentStatus, "warning" | "success" | "neutral"> = {
  UNPAID: "warning",
  PAID: "success",
  EXEMPT: "neutral",
};

function useInvalidateEntries(tournamentId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.tournaments.entries(tournamentId) });
    void invalidateTournament(client, tournamentId);
  };
}

/** Status, payment, category and seed of one entry. */
function ManageEntrySheet({
  tournament,
  entry: requested,
  onOpenChange,
}: {
  tournament: TournamentDetail;
  entry: EntrySummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("tournaments.manageEntry");
  const statuses = useTranslations("tournaments.entryStatus");
  const payments = useTranslations("tournaments.payment");
  const restrictionsT = useTranslations("tournaments.restrictions");
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const refresh = useInvalidateEntries(tournament.id);
  const entry = useLastDefined(requested);
  const [seed, setSeed] = useState("");

  const entryId = requested?.id;
  useEffect(() => {
    if (requested) setSeed(requested.seed ? String(requested.seed) : "");
    // Only when another entry opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const manage = useMutation({
    mutationFn: (input: ManageEntryInput) => api.tournamentEntries.manage(entry!.id, input),
    onSuccess: () => {
      toast.success(t("saved"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  if (!entry) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange} title={t("title")}>
        {null}
      </Sheet>
    );
  }
  const restrictions = entry.restrictions ?? NO_RESTRICTIONS;
  const hasRestrictions =
    restrictions.weekdayNotBefore ||
    restrictions.weekendNotBefore ||
    restrictions.unavailableDates.length > 0;
  const drawn =
    tournament.categories.find((item) => item.id === entry.categoryId)?.drawGenerated ?? false;

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={onOpenChange}
      title={entry.name}
      description={statuses(entry.status)}
    >
      <div className="space-y-5">
        <ul className="space-y-1 text-small">
          {entry.players.map((player) => (
            <li
              key={player.userId ?? player.name}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {player.name}
                {player.guest ? (
                  <span className="text-muted-foreground"> · {t("guest")}</span>
                ) : null}
              </span>
              <span className="num text-caption text-muted-foreground">
                {player.elo ?? "—"}
                {player.accepted ? "" : ` · ${t("notAccepted")}`}
              </span>
            </li>
          ))}
        </ul>
        {entry.note ? (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-small whitespace-pre-line">
            {entry.note}
          </p>
        ) : null}
        {hasRestrictions ? (
          <div className="space-y-1 text-caption text-muted-foreground">
            {restrictions.weekdayNotBefore ? (
              <p>{restrictionsT("weekdaySummary", { time: restrictions.weekdayNotBefore })}</p>
            ) : null}
            {restrictions.weekendNotBefore ? (
              <p>{restrictionsT("weekendSummary", { time: restrictions.weekendNotBefore })}</p>
            ) : null}
            {restrictions.unavailableDates.length > 0 ? (
              <p>
                {restrictionsT("datesSummary", {
                  dates: restrictions.unavailableDates.map((date) => format.day(date)).join(", "),
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-2">
          <SectionLabel>{t("status")}</SectionLabel>
          <ChipGroup label={t("status")}>
            {(["CONFIRMED", "WAITLISTED", "REJECTED", "WITHDRAWN"] as const).map((status) => (
              <ChoiceChip
                key={status}
                selected={entry.status === status}
                disabled={manage.isPending}
                onClick={() => entry.status !== status && manage.mutate({ status })}
              >
                {t(`action.${status}`)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </section>
        <section className="space-y-2">
          <SectionLabel>{t("payment")}</SectionLabel>
          <ChipGroup label={t("payment")}>
            {PAYMENT_STATUSES.map((status) => (
              <ChoiceChip
                key={status}
                selected={entry.paymentStatus === status}
                disabled={manage.isPending}
                onClick={() =>
                  entry.paymentStatus !== status && manage.mutate({ paymentStatus: status })
                }
              >
                {payments(status)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </section>
        {tournament.categories.length > 1 && !drawn ? (
          <section className="space-y-2">
            <SectionLabel>{t("move")}</SectionLabel>
            <ChipGroup label={t("move")}>
              {tournament.categories.map((category) => (
                <ChoiceChip
                  key={category.id}
                  selected={entry.categoryId === category.id}
                  disabled={
                    manage.isPending ||
                    category.entryType !==
                      tournament.categories.find((item) => item.id === entry.categoryId)?.entryType
                  }
                  onClick={() =>
                    entry.categoryId !== category.id && manage.mutate({ categoryId: category.id })
                  }
                >
                  {category.name}
                </ChoiceChip>
              ))}
            </ChipGroup>
          </section>
        ) : null}
        {!drawn ? (
          <section className="space-y-2">
            <SectionLabel>{t("seed")}</SectionLabel>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={128}
                className="num"
                aria-label={t("seed")}
                placeholder={t("seedPlaceholder")}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
              <Button
                variant="secondary"
                loading={manage.isPending}
                onClick={() => manage.mutate({ seed: seed ? Number(seed) : null })}
              >
                {t("saveSeed")}
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">{t("seedHint")}</p>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}

type PlayerSlot =
  { kind: "member"; member: PlayerSummary[] } | { kind: "guest"; name: string; phone: string };

/** Organizer adds an entry (members or external players). */
function AddEntrySheet({
  tournament,
  open,
  onOpenChange,
  defaultCategory,
}: {
  tournament: TournamentDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory: string | null;
}) {
  const t = useTranslations("tournaments.addEntry");
  const payments = useTranslations("tournaments.payment");
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const refresh = useInvalidateEntries(tournament.id);
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategory);
  const [slots, setSlots] = useState<PlayerSlot[]>([]);
  const [payment, setPayment] = useState<PaymentStatus>("UNPAID");
  const [restrictions, setRestrictions] = useState<TimeRestrictions>(NO_RESTRICTIONS);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const category =
    tournament.categories.find((item) => item.id === categoryId) ?? tournament.categories[0];
  const size = category?.entryType === "DOUBLES" ? 2 : 1;

  useEffect(() => {
    if (!open) return;
    setCategoryId(defaultCategory ?? tournament.categories[0]?.id ?? null);
    setSlots([]);
    setPayment("UNPAID");
    setRestrictions(NO_RESTRICTIONS);
    setNote("");
    setTouched(false);
    // Reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filled: PlayerSlot[] = Array.from(
    { length: size },
    (_, index) => slots[index] ?? { kind: "member", member: [] },
  );
  const request: OrganizerEntryRequest = {
    players: filled.flatMap((slot): OrganizerEntryRequest["players"] =>
      slot.kind === "member"
        ? slot.member[0]
          ? [{ userId: slot.member[0].id }]
          : []
        : [{ name: slot.name, phone: slot.phone }],
    ),
    paymentStatus: payment,
    restrictions,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  const check = organizerEntrySchema.safeParse(request);
  const complete = request.players.length === size;
  const error =
    touched && !check.success
      ? issueMessage(check.error.issues[0])
      : touched && !complete
        ? t("playersMissing")
        : null;

  const setSlot = (index: number, slot: PlayerSlot) =>
    setSlots(filled.map((current, at) => (at === index ? slot : current)));
  const chosenIds = filled.flatMap((slot) =>
    slot.kind === "member" ? slot.member.map((player) => player.id) : [],
  );

  const add = useMutation({
    mutationFn: () => api.tournaments.addEntry(tournament.id, category!.id, request),
    onSuccess: () => {
      toast.success(t("added"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      footer={
        <Button
          size="lg"
          block
          loading={add.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success && complete) add.mutate();
          }}
        >
          {t("submit")}
        </Button>
      }
    >
      <div className="space-y-5">
        <CategoryChips
          categories={tournament.categories}
          value={category?.id ?? null}
          onChange={setCategoryId}
        />
        {filled.map((slot, index) => (
          <section key={index} className="space-y-3 rounded-lg border border-border p-3">
            <SectionLabel>{t("player", { number: index + 1 })}</SectionLabel>
            <SegmentedControl
              label={t("kind")}
              options={[
                { value: "member", label: t("member") },
                { value: "guest", label: t("external") },
              ]}
              value={slot.kind}
              onChange={(kind) =>
                setSlot(
                  index,
                  kind === "member" ? { kind, member: [] } : { kind, name: "", phone: "" },
                )
              }
            />
            {slot.kind === "member" ? (
              <MemberPicker
                label={t("memberLabel")}
                selected={slot.member}
                onChange={(member) => setSlot(index, { kind: "member", member })}
                max={1}
                excludeIds={chosenIds.filter(
                  (id) => !slot.member.some((player) => player.id === id),
                )}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("name")} htmlFor={`guest-name-${index}`}>
                  <Input
                    id={`guest-name-${index}`}
                    value={slot.name}
                    onChange={(event) => setSlot(index, { ...slot, name: event.target.value })}
                  />
                </Field>
                <Field label={t("phone")} htmlFor={`guest-phone-${index}`}>
                  <Input
                    id={`guest-phone-${index}`}
                    type="tel"
                    inputMode="tel"
                    value={slot.phone}
                    onChange={(event) => setSlot(index, { ...slot, phone: event.target.value })}
                  />
                </Field>
              </div>
            )}
          </section>
        ))}
        <section className="space-y-2">
          <SectionLabel>{t("payment")}</SectionLabel>
          <ChipGroup label={t("payment")}>
            {PAYMENT_STATUSES.map((status) => (
              <ChoiceChip
                key={status}
                selected={payment === status}
                onClick={() => setPayment(status)}
              >
                {payments(status)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </section>
        <section className="space-y-2">
          <SectionLabel>{t("availability")}</SectionLabel>
          <RestrictionsFields
            value={restrictions}
            onChange={setRestrictions}
            dates={datesBetween(tournament.startDate, tournament.endDate)}
          />
        </section>
        <Field label={t("note")} htmlFor="add-note">
          <Textarea
            id="add-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-small text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Entries of every category: approve, payments, moves, seeds, manual entries and CSV export. */
export function EntriesManager({ tournament }: { tournament: TournamentDetail }) {
  const t = useTranslations("tournaments.entriesManager");
  const statuses = useTranslations("tournaments.entryStatus");
  const payments = useTranslations("tournaments.payment");
  const format = useFormat();
  const [categoryId, setCategoryId] = useState<string | null>(tournament.categories[0]?.id ?? null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [selected, setSelected] = useState<EntrySummary | null>(null);
  const [adding, setAdding] = useState(false);
  const entries = useQuery({
    queryKey: queryKeys.tournaments.entries(tournament.id),
    queryFn: () => api.tournaments.entries(tournament.id),
  });
  const category =
    tournament.categories.find((item) => item.id === categoryId) ?? tournament.categories[0];
  const rows = (entries.data ?? [])
    .filter(
      (entry) => entry.categoryId === category?.id && IN_FILTER[filter].includes(entry.status),
    )
    .sort((x, y) => (x.seed ?? 999) - (y.seed ?? 999) || y.rating - x.rating);
  const pendingCount = (entries.data ?? []).filter(
    (entry) => entry.status === "PENDING_APPROVAL",
  ).length;

  if (tournament.categories.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t("noCategories")}
        description={t("noCategoriesDescription")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus />
          {t("add")}
        </Button>
        <a
          href={api.tournaments.entriesCsvUrl(tournament.id)}
          download
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-small font-medium hover:bg-surface-3"
        >
          <Download className="size-4" />
          {t("csv")}
        </a>
        {pendingCount > 0 ? (
          <Badge tone="warning">{t("pending", { count: pendingCount })}</Badge>
        ) : null}
      </div>
      <CategoryChips
        categories={tournament.categories}
        value={category?.id ?? null}
        onChange={setCategoryId}
      />
      <div
        role="group"
        aria-label={t("filter")}
        className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        {FILTERS.map((value) => (
          <ChoiceChip
            key={value}
            selected={filter === value}
            onClick={() => setFilter(value)}
            className="h-9"
          >
            {t(`filters.${value}`)}
          </ChoiceChip>
        ))}
      </div>
      {category ? (
        <p className="text-caption text-muted-foreground">
          {t("summary", {
            confirmed: category.confirmedEntries,
            max: category.maxEntries,
            waitlisted: category.waitlisted,
          })}
        </p>
      ) : null}

      {entries.isError ? (
        <ErrorState onRetry={() => void entries.refetch()} />
      ) : entries.isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Plus} title={t("emptyTitle")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          <AnimatePresence initial={false}>
            {rows.map((entry, index) => (
              <motion.li
                key={entry.id}
                layout="position"
                custom={index}
                variants={listItemVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <motion.button
                  type="button"
                  whileTap={tap}
                  onClick={() => setSelected(entry)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
                >
                  <span className="w-8 shrink-0 text-center num text-caption text-muted-foreground">
                    {entry.seed ? `[${entry.seed}]` : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium">{entry.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      <span className="num">{entry.rating}</span> ·{" "}
                      {format.dateTime(entry.createdAt)}
                      {entry.note ? ` · ${t("hasNote")}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={ENTRY_TONE[entry.status]} className="h-6">
                      {statuses(entry.status)}
                    </Badge>
                    <Badge tone={PAYMENT_TONE[entry.paymentStatus]} className={cn("h-6")}>
                      {payments(entry.paymentStatus)}
                    </Badge>
                  </span>
                </motion.button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <ManageEntrySheet
        tournament={tournament}
        entry={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
      <AddEntrySheet
        tournament={tournament}
        open={adding}
        onOpenChange={setAdding}
        defaultCategory={category?.id ?? null}
      />
    </div>
  );
}
