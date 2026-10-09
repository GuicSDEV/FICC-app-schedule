"use client";

import type {
  Announcement,
  DrawView,
  OrderOfPlay,
  TournamentCategoryInfo,
  TournamentDetail,
  TournamentMatchView,
  TournamentStatus,
} from "@ficc/shared";
import { CalendarDays, ListOrdered, MapPin, Megaphone, Trophy, Users } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, SectionLabel } from "@/components/ui/card";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { CourtLines } from "@/components/ui/court-lines";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/states";
import { enter, listItemVariants, spring, tap } from "@/lib/motion";
import { formatMoney, STATUS_TONE, sideUserIds } from "@/lib/tournaments";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

import { BracketView } from "./bracket-view";
import { GroupsView } from "./groups-view";
import { MatchRow } from "./match-row";
import { SimpleMarkdown } from "./simple-markdown";

export function StatusBadge({
  status,
  className,
}: {
  status: TournamentStatus;
  className?: string;
}) {
  const labels = useTranslations("labels.tournamentStatus");
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      <span className="first-letter:uppercase">{labels(status)}</span>
    </Badge>
  );
}

/** "12 – 15 de out" style range. */
export function useDateRange() {
  const format = useFormat();
  return (start: string, end: string) =>
    start === end ? format.dayTitle(start) : `${format.dayTitle(start)} – ${format.day(end)}`;
}

/** Underlined tab bar that scrolls sideways on small screens. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 no-scrollbar flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0"
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <motion.button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            whileTap={tap}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative h-11 shrink-0 px-3 text-small font-medium transition-tokens",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count ? (
              <span className="ml-1.5 num text-caption text-muted-foreground">{tab.count}</span>
            ) : null}
            {selected ? (
              <motion.span
                layoutId={`tab-${id}`}
                transition={spring.snappy}
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
              />
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Category chips (only when there is more than one). */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("tournaments");
  if (categories.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t("categories")}
      className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
    >
      {categories.map((category) => (
        <ChoiceChip
          key={category.id}
          selected={value === category.id}
          onClick={() => onChange(category.id)}
        >
          {category.name}
        </ChoiceChip>
      ))}
    </div>
  );
}

/** Cover, name, status, dates and place; actions on the right. */
export function TournamentHero({
  tournament,
  actions,
}: {
  tournament: Pick<
    TournamentDetail,
    "name" | "status" | "startDate" | "endDate" | "location" | "coverImageUrl" | "circuit"
  >;
  actions?: ReactNode;
}) {
  const range = useDateRange();
  return (
    <section className="grain relative overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {tournament.coverImageUrl ? (
        <div className="relative h-36 w-full md:h-48">
          <Image src={tournament.coverImageUrl} alt="" fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        </div>
      ) : (
        <>
          <CourtLines className="opacity-[0.06]" />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 size-60 rounded-full bg-gold/15 blur-3xl"
          />
        </>
      )}
      <div className={cn("relative space-y-3 p-5", tournament.coverImageUrl && "-mt-10")}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={tournament.status} />
          {tournament.circuit ? (
            <Badge tone="lesson">
              <ListOrdered />
              {tournament.circuit.name}
            </Badge>
          ) : null}
        </div>
        <h2 className="font-display text-headline font-semibold md:text-display">
          {tournament.name}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" />
            {range(tournament.startDate, tournament.endDate)}
          </span>
          {tournament.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {tournament.location}
            </span>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </div>
    </section>
  );
}

export function AnnouncementList({ announcements }: { announcements: Announcement[] }) {
  const t = useTranslations("tournaments.info");
  const format = useFormat();
  if (announcements.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionLabel>{t("announcements")}</SectionLabel>
      <ul className="space-y-2">
        {announcements.map((announcement, index) => (
          <motion.li
            key={announcement.id}
            custom={index}
            variants={listItemVariants}
            initial={enter("hidden")}
            animate="show"
            className="flex gap-3 rounded-lg border border-border bg-card p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ball-soft text-ball-ink">
              <Megaphone className="size-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-small whitespace-pre-line">{announcement.body}</p>
              <p className="text-caption text-muted-foreground">
                {announcement.authorName} · {format.relative(announcement.createdAt)}
                {announcement.categoryName ? ` · ${announcement.categoryName}` : ""}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** Rules, fee, window, categories (with the register action) and sponsors. */
export function InfoPanel({
  tournament,
  categoryAction,
}: {
  tournament: Omit<TournamentDetail, "myEntries" | "canManage" | "organizers"> & {
    organizers?: TournamentDetail["organizers"];
  };
  /** Register button (or entry status) per category. */
  categoryAction?: (category: TournamentCategoryInfo) => ReactNode;
}) {
  const t = useTranslations("tournaments.info");
  const formats = useTranslations("tournaments.scoreFormat");
  const drawFormats = useTranslations("tournaments.drawFormat");
  const common = useTranslations("common");
  const format = useFormat();
  return (
    <div className="space-y-6">
      <AnnouncementList announcements={tournament.announcements} />

      <section className="space-y-3">
        <SectionLabel>{t("categories")}</SectionLabel>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tournament.categories.map((category) => (
            <li key={category.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-title font-semibold">{category.name}</p>
                    <p className="text-caption text-muted-foreground">
                      {category.entryType === "SINGLES" ? common("singles") : common("doubles")} ·{" "}
                      {drawFormats(category.drawFormat)} · {formats(category.scoreFormat)}
                    </p>
                  </div>
                  {category.championEntryId ? (
                    <Trophy className="size-5 shrink-0 text-gold" />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-caption">
                  <Badge>
                    <Users />
                    {t("spots", { taken: category.confirmedEntries, max: category.maxEntries })}
                  </Badge>
                  {category.waitlisted > 0 ? (
                    <Badge tone="warning">{t("waitlist", { count: category.waitlisted })}</Badge>
                  ) : null}
                  {category.countsForElo ? (
                    <Badge tone="ballSoft">{t("countsForElo")}</Badge>
                  ) : null}
                  {category.circuitCategoryName ? (
                    <Badge tone="lesson">
                      {t("circuitCategory", { name: category.circuitCategoryName })}
                    </Badge>
                  ) : null}
                </div>
                {categoryAction ? <div className="mt-auto">{categoryAction(category)}</div> : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="space-y-1 p-4">
          <SectionLabel>{t("registration")}</SectionLabel>
          <p className="text-small">
            {tournament.registrationOpensAt || tournament.registrationClosesAt
              ? t("window", {
                  from: tournament.registrationOpensAt
                    ? format.dateTime(tournament.registrationOpensAt)
                    : "—",
                  to: tournament.registrationClosesAt
                    ? format.dateTime(tournament.registrationClosesAt)
                    : "—",
                })
              : t("noWindow")}
          </p>
          {tournament.requiresApproval ? (
            <p className="text-caption text-muted-foreground">{t("requiresApproval")}</p>
          ) : null}
        </Card>
        <Card className="space-y-1 p-4">
          <SectionLabel>{t("fee")}</SectionLabel>
          <p className="text-small">
            {tournament.feeAmountCents ? formatMoney(tournament.feeAmountCents) : t("free")}
          </p>
          {tournament.allowGuests ? (
            <p className="text-caption text-muted-foreground">{t("guestsAllowed")}</p>
          ) : null}
        </Card>
      </section>

      {tournament.description ? (
        <section className="space-y-2">
          <SectionLabel>{t("rules")}</SectionLabel>
          <Card className="p-4">
            <SimpleMarkdown
              source={tournament.description}
              className="text-small leading-relaxed"
            />
          </Card>
        </section>
      ) : null}

      {tournament.organizers && tournament.organizers.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel>{t("organizers")}</SectionLabel>
          <p className="text-small">
            {tournament.organizers.map((organizer) => organizer.name).join(", ")}
          </p>
        </section>
      ) : null}

      {tournament.sponsorLogos.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel>{t("sponsors")}</SectionLabel>
          <div className="flex flex-wrap items-center gap-4">
            {tournament.sponsorLogos.map((logo) => (
              <span
                key={logo}
                className="relative h-12 w-28 overflow-hidden rounded-md bg-white p-1"
              >
                <Image src={logo} alt="" fill className="object-contain" unoptimized />
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Confirmed entries of a category (names and seeds). */
export function EntriesPanel({
  tournament,
  categoryId,
  onCategory,
}: {
  tournament: Pick<TournamentDetail, "categories" | "entries">;
  categoryId: string | null;
  onCategory: (id: string) => void;
}) {
  const t = useTranslations("tournaments.entries");
  const category =
    tournament.categories.find((entry) => entry.id === categoryId) ?? tournament.categories[0];
  const entries = category ? (tournament.entries[category.id] ?? []) : [];
  const confirmed = entries.filter((entry) => entry.status === "CONFIRMED");
  const waitlist = entries.filter((entry) => entry.status === "WAITLISTED");
  return (
    <div className="space-y-4">
      <CategoryChips
        categories={tournament.categories}
        value={category?.id ?? null}
        onChange={onCategory}
      />
      {confirmed.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border bg-card">
          {[...confirmed]
            .sort((x, y) => (x.seed ?? 999) - (y.seed ?? 999))
            .map((entry, index) => (
              <motion.li
                key={entry.id}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
                className="flex min-h-12 items-center gap-3 px-4 py-2 text-small"
              >
                <span className="w-6 num text-caption text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.seed ? (
                  <Badge tone="ballSoft">{t("seed", { seed: entry.seed })}</Badge>
                ) : null}
              </motion.li>
            ))}
        </ol>
      )}
      {waitlist.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel>{t("waitlist")}</SectionLabel>
          <ol className="space-y-1 text-small text-muted-foreground">
            {waitlist.map((entry, index) => (
              <li key={entry.id}>
                {index + 1}. {entry.name}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/** Groups and/or bracket of one category. */
export function DrawPanel({
  categories,
  categoryId,
  onCategory,
  draw,
  loading,
  onOpenMatch,
}: {
  categories: TournamentCategoryInfo[];
  categoryId: string | null;
  onCategory: (id: string) => void;
  draw: DrawView | undefined;
  loading: boolean;
  onOpenMatch?: (match: TournamentMatchView) => void;
}) {
  const t = useTranslations("tournaments.draw");
  const category = categories.find((entry) => entry.id === categoryId) ?? categories[0];
  return (
    <div className="space-y-4">
      <CategoryChips categories={categories} value={category?.id ?? null} onChange={onCategory} />
      {!category?.drawPublished ? (
        <EmptyState
          icon={Trophy}
          title={t("notPublishedTitle")}
          description={t("notPublishedDescription")}
        />
      ) : loading || !draw ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : (
        <div className="space-y-6">
          {draw.groups.length > 0 ? (
            <section className="space-y-3">
              <SectionLabel>{t("groups")}</SectionLabel>
              <GroupsView
                groups={draw.groups}
                advancePerGroup={draw.category.advancePerGroup}
                onOpenMatch={onOpenMatch}
              />
            </section>
          ) : null}
          {draw.rounds.length > 0 ? (
            <section className="space-y-3">
              <SectionLabel>{t("knockout")}</SectionLabel>
              <BracketView draw={draw} onOpenMatch={onOpenMatch} />
              <p className="text-caption text-muted-foreground">{t("zoomHint")}</p>
            </section>
          ) : draw.groups.length > 0 ? (
            <p className="text-small text-muted-foreground">{t("knockoutAfterGroups")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Order of play: one block per day, matches by time. */
export function SchedulePanel({
  days,
  loading,
  viewerId,
  mineOnly,
  onOpenMatch,
}: {
  days: OrderOfPlay[] | undefined;
  loading: boolean;
  viewerId?: string;
  mineOnly?: boolean;
  onOpenMatch?: (match: TournamentMatchView) => void;
}) {
  const t = useTranslations("tournaments.schedule");
  const format = useFormat();
  if (loading || !days) return <Skeleton className="h-64 rounded-lg" />;
  const filtered = days
    .map((day) => ({
      ...day,
      matches: day.matches
        .filter(
          (match) =>
            !mineOnly ||
            (viewerId !== undefined &&
              [...sideUserIds(match.a), ...sideUserIds(match.b)].includes(viewerId)),
        )
        .sort(
          (x, y) =>
            (x.schedule?.startTime ?? "").localeCompare(y.schedule?.startTime ?? "") ||
            (x.schedule?.courtName ?? "").localeCompare(y.schedule?.courtName ?? "", undefined, {
              numeric: true,
            }),
        ),
    }))
    .filter((day) => day.matches.length > 0);
  if (filtered.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title={t("emptyTitle")} description={t("emptyDescription")} />
    );
  }
  return (
    <div className="space-y-6">
      {filtered.map((day) => (
        <section key={day.date} className="space-y-3">
          <div className="flex items-center gap-2">
            <SectionLabel>{format.longDayTitle(day.date)}</SectionLabel>
            {!day.published ? <Badge tone="warning">{t("draft")}</Badge> : null}
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {day.matches.map((match, index) => (
              <motion.li
                key={match.id}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
              >
                <MatchRow match={match} viewerId={viewerId} onOpen={onOpenMatch} />
              </motion.li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Decided matches of one category, latest round first. */
export function ResultsPanel({
  categories,
  categoryId,
  onCategory,
  draw,
  loading,
  viewerId,
  onOpenMatch,
}: {
  categories: TournamentCategoryInfo[];
  categoryId: string | null;
  onCategory: (id: string) => void;
  draw: DrawView | undefined;
  loading: boolean;
  viewerId?: string;
  onOpenMatch?: (match: TournamentMatchView) => void;
}) {
  const t = useTranslations("tournaments.results");
  const category = categories.find((entry) => entry.id === categoryId) ?? categories[0];
  const matches = draw
    ? [
        ...draw.rounds.flatMap((round) => round.matches),
        ...draw.groups.flatMap((group) => group.matches),
      ]
        .filter((match) => match.resultStatus !== "NONE" && match.outcome !== "BYE")
        .sort(
          (x, y) =>
            (x.stage === y.stage ? 0 : x.stage === "KNOCKOUT" ? -1 : 1) ||
            y.round - x.round ||
            x.position - y.position,
        )
    : [];
  return (
    <div className="space-y-4">
      <CategoryChips categories={categories} value={category?.id ?? null} onChange={onCategory} />
      {!category?.drawPublished ? (
        <EmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : loading || !draw ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : matches.length === 0 ? (
        <EmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {matches.map((match, index) => (
            <motion.li
              key={match.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <MatchRow
                match={match}
                viewerId={viewerId}
                onOpen={onOpenMatch}
                showCategory={false}
              />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
