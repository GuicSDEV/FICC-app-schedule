"use client";

import type { Surface } from "@ficc/shared";
import { CloudRain, Lock, Plus, Star, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { duration, ease, spring, tap, transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { Avatar } from "./avatar";
import { AvatarStack } from "./avatar-stack";

export type SlotChipState = "free" | "lesson" | "booking" | "frozen";

export interface SlotChipProps {
  courtName: string;
  surface: Surface;
  state: SlotChipState;
  past?: boolean;
  favorite?: boolean;
  /** The viewer is one of the booking's players. */
  mine?: boolean;
  coach?: { displayName: string; photoUrl: string | null; color: string } | null;
  players?: { id: string; name: string; photoUrl: string | null; pending?: boolean }[];
  bookingStatus?: "PENDING" | "CONFIRMED";
  freezeReason?: "RAIN" | "MAINTENANCE";
  /** Bumped when the cell changed live, to flash it. */
  highlightKey?: number;
  /** Plays the "booking confirmed" fill in the court's surface color. */
  celebrate?: boolean;
  onPress?: () => void;
  className?: string;
}

const SURFACE_STYLES: Record<Surface, { free: string; booked: string; fill: string; ink: string }> = {
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

function describe(props: SlotChipProps): string {
  const base = `Quadra ${props.courtName}`;
  if (props.past) return `${base}, horário encerrado`;
  switch (props.state) {
    case "free":
      return `${base}, livre${props.favorite ? ", favorita" : ""}. Toque para reservar`;
    case "lesson":
      return `${base}, aula com ${props.coach?.displayName ?? "professor"}`;
    case "booking":
      return `${base}, reservada${props.bookingStatus === "PENDING" ? " (aguardando confirmação)" : ""} por ${props.players?.map((player) => player.name).join(", ") ?? ""}`;
    case "frozen":
      return `${base}, interditada por ${props.freezeReason === "RAIN" ? "chuva" : "manutenção"}`;
  }
}

/**
 * One court in one slot. Adapts its content to its width (container queries): compact chips in
 * the mobile slot rows, richer cells in the desktop grid.
 */
export function SlotChip(props: SlotChipProps) {
  const { courtName, surface, state, past, favorite, mine, coach, players, bookingStatus, freezeReason, highlightKey, celebrate, onPress, className } =
    props;
  const styles = SURFACE_STYLES[surface];
  const interactive = Boolean(onPress) && !past && state !== "frozen";

  return (
    <motion.button
      type="button"
      onClick={interactive ? onPress : undefined}
      aria-disabled={!interactive}
      aria-label={describe(props)}
      whileTap={interactive ? tap : undefined}
      transition={spring.snappy}
      className={cn(
        "@container relative flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border text-caption font-semibold transition-tokens outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        state === "free" && cn("border-dashed bg-transparent", styles.free, styles.ink),
        state === "lesson" && "border-lesson/40 bg-lesson-soft text-lesson-ink",
        state === "booking" &&
          (bookingStatus === "PENDING" ? "border-dashed border-border-strong bg-surface-2 text-foreground" : cn(styles.booked, "text-foreground")),
        state === "frozen" && "striped border-warning/40 bg-surface text-warning-ink",
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
          key={`${state}-${bookingStatus ?? ""}`}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1, transition: transitions.base }}
          exit={{ opacity: 0, scale: 1.15, transition: transitions.slow }}
          className="relative flex w-full min-w-0 items-center justify-center gap-1.5 px-1.5"
        >
          {state === "free" ? (
            <>
              <span className="num">{courtName}</span>
              <Plus aria-hidden className="hidden size-3.5 @[5.5rem]:block" />
              <span className="hidden font-medium @[7.5rem]:inline">Livre</span>
            </>
          ) : null}

          {state === "lesson" && coach ? (
            <>
              <Avatar name={coach.displayName} src={coach.photoUrl} size="xs" ring={coach.color} className="shrink-0" />
              <span className="num @[7.5rem]:hidden">{courtName}</span>
              <span className="hidden min-w-0 truncate font-medium @[7.5rem]:inline">{coach.displayName}</span>
              <Lock aria-hidden className="hidden size-3 shrink-0 opacity-80 @[5.5rem]:block" />
            </>
          ) : null}

          {state === "booking" && players ? (
            <>
              <AvatarStack people={players} max={2} size="xs" className="@[7.5rem]:hidden" />
              <span className="hidden min-w-0 items-center gap-2 @[7.5rem]:flex">
                <AvatarStack people={players} max={4} size="xs" />
                <span className="num text-muted-foreground">{courtName}</span>
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
                      <span key={drop} className="h-1 w-px animate-rain bg-current" style={{ animationDelay: `calc(var(--loop-rain) * ${drop} / 3)` }} />
                    ))}
                  </span>
                </span>
              )}
              <span className="num hidden @[5.5rem]:inline">{courtName}</span>
            </>
          ) : null}
        </motion.span>
      </AnimatePresence>

      {favorite && state !== "frozen" ? (
        <Star aria-hidden className="absolute top-1 right-1 size-2.5 fill-current text-warning" />
      ) : null}
    </motion.button>
  );
}
