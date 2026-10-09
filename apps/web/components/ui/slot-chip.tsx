"use client";

import type { Surface } from "@ficc/shared";
import { Ban, CloudRain, Hourglass, Lock, Plus, Star, Trophy, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";

import { duration, ease, spring, tap, transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { Avatar } from "./avatar";
import { AvatarStack } from "./avatar-stack";

export type SlotChipState = "free" | "lesson" | "booking" | "tournament" | "frozen" | "closed";

export interface SlotChipProps {
  courtName: string;
  surface: Surface;
  state: SlotChipState;
  past?: boolean;
  favorite?: boolean;
  /** The viewer is one of the booking's players. */
  mine?: boolean;
  /** Staff: past bookings open their sheet (no-shows). */
  pastBookingsOpen?: boolean;
  coach?: { displayName: string; photoUrl: string | null; color: string } | null;
  players?: { id: string; name: string; photoUrl: string | null; pending?: boolean }[];
  bookingStatus?: "PENDING" | "CONFIRMED";
  freezeReason?: "RAIN" | "MAINTENANCE";
  /** Free, but another member is booking it right now (it may free up again). */
  held?: boolean;
  /** Tournament match holding the slot. */
  tournament?: { tournamentName: string; label: string } | null;
  /** Bumped when the cell changed live, to flash it. */
  highlightKey?: number;
  /** Plays the "booking confirmed" fill in the court's surface color. */
  celebrate?: boolean;
  onPress?: () => void;
  className?: string;
}

const SURFACE_STYLES: Record<Surface, { free: string; booked: string; fill: string; ink: string }> =
  {
    HARTRU: {
      free: "border-hartru/70 hover:bg-hartru-soft",
      booked: "border-hartru/40 bg-hartru-soft",
      fill: "bg-hartru",
      ink: "text-hartru-ink",
    },
    SAIBRO: {
      free: "border-saibro/70 hover:bg-saibro-soft",
      booked: "border-saibro/40 bg-saibro-soft",
      fill: "bg-saibro",
      ink: "text-saibro-ink",
    },
  };

type Translate = ReturnType<typeof useTranslations<"slot">>;

/** What a screen reader announces for the chip. */
function describe(props: SlotChipProps, t: Translate): string {
  const court = t("court", { court: props.courtName });
  if (props.past) return t("past", { court });
  switch (props.state) {
    case "free":
      if (props.held) return t("held", { court });
      return props.favorite ? t("freeFavorite", { court }) : t("free", { court });
    case "lesson":
      return props.coach
        ? t("lesson", { court, coach: props.coach.displayName })
        : t("lessonUnknown", { court });
    case "booking": {
      const players = props.players?.map((player) => player.name).join(", ") ?? "";
      return props.bookingStatus === "PENDING"
        ? t("bookingPending", { court, players })
        : t("booking", { court, players });
    }
    case "tournament":
      return t("tournament", {
        court,
        name: props.tournament?.tournamentName ?? "",
        match: props.tournament?.label ?? "",
      });
    case "frozen":
      return t("frozen", { court, reason: props.freezeReason ?? "MAINTENANCE" });
    case "closed":
      return t("closed", { court });
  }
}

/**
 * One court in one slot. Adapts its content to its width (container queries): compact chips in
 * the mobile slot rows, richer cells in the desktop grid.
 */
export function SlotChip(props: SlotChipProps) {
  const t = useTranslations("slot");
  const {
    courtName,
    surface,
    state,
    past,
    favorite,
    mine,
    coach,
    players,
    bookingStatus,
    freezeReason,
    held,
    highlightKey,
    celebrate,
    onPress,
    className,
  } = props;
  const styles = SURFACE_STYLES[surface];
  // Past bookings stay tappable for their players (and staff), to report a no-show.
  const interactive =
    Boolean(onPress) &&
    state !== "frozen" &&
    state !== "closed" &&
    (!past || (state === "booking" && Boolean(props.pastBookingsOpen || mine)));

  return (
    <motion.button
      type="button"
      onClick={interactive ? onPress : undefined}
      aria-disabled={!interactive}
      aria-label={describe(props, t)}
      whileTap={interactive ? tap : undefined}
      transition={spring.snappy}
      className={cn(
        "@container relative flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border text-caption font-semibold transition-tokens outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        state === "free" && !held && cn("border-dashed bg-transparent", styles.free, styles.ink),
        state === "free" && held && "border-warning/60 bg-warning-soft text-warning-ink",
        state === "lesson" && "border-lesson/40 bg-lesson-soft text-lesson-ink",
        state === "booking" &&
          (bookingStatus === "PENDING"
            ? "border-dashed border-border-strong bg-surface-2 text-foreground"
            : cn(styles.booked, "text-foreground")),
        state === "tournament" && "border-gold/50 bg-gold/15 text-foreground",
        state === "frozen" && "border-warning/40 bg-surface striped text-warning-ink",
        state === "closed" && "border-border bg-surface-2 striped text-muted-foreground",
        mine && state === "booking" && "ring-2 ring-ball ring-offset-2 ring-offset-background",
        past && "opacity-40",
        !interactive && "cursor-default",
        className,
      )}
    >
      {/* Booking confirmed: the slot fills with the court's surface color. */}
      <AnimatePresence>
        {celebrate ? (
          <motion.span
            key="fill"
            aria-hidden
            initial={{ scaleY: 0, opacity: 1 }}
            animate={{ scaleY: 1, opacity: [1, 1, 0.35] }}
            exit={{ opacity: 0, transition: transitions.base }}
            transition={{ duration: duration.slow, ease: ease.out }}
            style={{ originY: 1 }}
            className={cn("absolute inset-0", styles.fill)}
          />
        ) : null}
      </AnimatePresence>

      {/* Live change: a brief ring flash. */}
      {highlightKey ? (
        <motion.span
          key={highlightKey}
          aria-hidden
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: duration.slow * 2, ease: ease.out }}
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary ring-inset"
        />
      ) : null}

      {/* Content crossfades between states: a cancelled lesson dissolves into a free slot. */}
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={`${state}-${bookingStatus ?? ""}-${held ? "held" : ""}`}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1, transition: transitions.base }}
          exit={{ opacity: 0, scale: 1.15, transition: transitions.slow }}
          className="relative flex w-full min-w-0 items-center justify-center gap-1.5 px-1 @[5.5rem]:px-1.5"
        >
          {state === "free" && held ? (
            <>
              <Hourglass aria-hidden className="size-3.5 shrink-0" />
              <span className="num">{courtName}</span>
              <span className="hidden font-medium @[7.5rem]:inline">{t("heldLabel")}</span>
            </>
          ) : state === "free" ? (
            <>
              <span className="num">{courtName}</span>
              <Plus aria-hidden className="hidden size-3.5 @[5.5rem]:block" />
              <span className="hidden font-medium @[7.5rem]:inline">{t("freeLabel")}</span>
            </>
          ) : null}

          {state === "lesson" && coach ? (
            <>
              {/* Narrow chips stack the avatar over the court name; wider ones go side by side. */}
              <span className="flex flex-col items-center gap-1 @[5.5rem]:flex-row @[5.5rem]:gap-1.5">
                <Avatar
                  name={coach.displayName}
                  src={coach.photoUrl}
                  size="xs"
                  ring={coach.color}
                  className="shrink-0"
                />
                <span className="num text-[0.625rem] leading-none @[5.5rem]:text-caption @[7.5rem]:hidden">
                  {courtName}
                </span>
              </span>
              <span className="hidden min-w-0 truncate font-medium @[7.5rem]:inline">
                {coach.displayName}
              </span>
              <Lock aria-hidden className="hidden size-3 shrink-0 opacity-80 @[5.5rem]:block" />
            </>
          ) : null}

          {state === "booking" && players ? (
            <>
              <span className="flex flex-col items-center gap-1 @[5.5rem]:hidden">
                {players[0] ? (
                  <Avatar name={players[0].name} src={players[0].photoUrl} size="xs" />
                ) : null}
                <span className="num text-[0.625rem] leading-none text-muted-foreground">
                  {courtName}
                </span>
              </span>
              <AvatarStack
                people={players}
                max={2}
                size="xs"
                className="hidden @[5.5rem]:flex @[7.5rem]:hidden"
              />
              <span className="hidden min-w-0 items-center gap-2 @[7.5rem]:flex">
                <AvatarStack people={players} max={4} size="xs" />
                <span className="num text-muted-foreground">{courtName}</span>
              </span>
            </>
          ) : null}

          {state === "tournament" ? (
            <>
              <span className="flex flex-col items-center gap-1 @[5.5rem]:flex-row @[5.5rem]:gap-1.5">
                <Trophy aria-hidden className="size-4 shrink-0 text-gold" />
                <span className="num text-[0.625rem] leading-none @[5.5rem]:text-caption @[7.5rem]:hidden">
                  {courtName}
                </span>
              </span>
              <span className="hidden min-w-0 truncate font-medium @[7.5rem]:inline">
                {props.tournament?.label}
              </span>
            </>
          ) : null}

          {state === "frozen" ? (
            <>
              {freezeReason === "MAINTENANCE" ? (
                <Wrench aria-hidden className="size-4" />
              ) : (
                <span aria-hidden className="relative">
                  <CloudRain className="size-4" />
                  <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                    {[0, 1, 2].map((drop) => (
                      <span
                        key={drop}
                        className="h-1 w-px animate-rain bg-current"
                        style={{ animationDelay: `calc(var(--loop-rain) * ${drop} / 3)` }}
                      />
                    ))}
                  </span>
                </span>
              )}
              <span className="hidden num @[5.5rem]:inline">{courtName}</span>
            </>
          ) : null}

          {state === "closed" ? (
            <>
              <Ban aria-hidden className="size-4" />
              <span className="hidden num @[5.5rem]:inline">{courtName}</span>
            </>
          ) : null}
        </motion.span>
      </AnimatePresence>

      {favorite && state !== "frozen" && state !== "closed" ? (
        <Star aria-hidden className="absolute top-1 right-1 size-2.5 fill-current text-warning" />
      ) : null}
    </motion.button>
  );
}
