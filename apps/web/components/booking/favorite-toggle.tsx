"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { haptic, popVariants, spring, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { patchScheduleCells } from "@/lib/schedule-cache";
import { cn } from "@/lib/utils";

/**
 * Watch a court + time slot (every day) to be told when it opens up. Optimistic: the star and the
 * calendar's favorite marks flip right away and roll back on error.
 */
export function FavoriteToggle({
  courtId,
  timeSlotId,
  favorite,
  compact,
}: {
  courtId: string;
  timeSlotId: string;
  favorite: boolean;
  /** Icon-only button (sheet headers). */
  compact?: boolean;
}) {
  const client = useQueryClient();
  const [on, setOn] = useState(favorite);
  useEffect(() => setOn(favorite), [favorite]);

  const mutation = useMutation({
    mutationFn: async (next: boolean): Promise<void> => {
      if (next) await api.favorites.add({ courtId, timeSlotId });
      else await api.favorites.remove({ courtId, timeSlotId });
    },
    onMutate: (next) => {
      setOn(next);
      return patchScheduleCells(
        client,
        (cell) => cell.courtId === courtId && cell.timeSlotId === timeSlotId,
        (cell) => ({ ...cell, favorite: next }),
      );
    },
    onError: (failure, next, rollback) => {
      rollback?.();
      setOn(!next);
      toast.error(
        failure instanceof ApiError ? failure.message : "Não foi possível salvar o favorito.",
      );
    },
    onSuccess: (_result, next) => {
      haptic();
      toast(next ? "Horário favorito" : "Favorito removido", {
        description: next ? "Avisamos quando ele ficar livre." : undefined,
      });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.favorites }),
  });

  const label = on ? "Remover dos favoritos" : "Avisar quando este horário abrir";
  const icon = (
    <span className="relative inline-flex size-5 items-center justify-center">
      <Star
        aria-hidden
        className={cn("size-5 transition-tokens", on ? "text-warning" : "text-muted-foreground")}
      />
      <AnimatePresence initial={false}>
        {on ? (
          <motion.span
            key="fill"
            variants={popVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0"
          >
            <Star aria-hidden className="size-5 fill-warning text-warning" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );

  return (
    <motion.button
      type="button"
      whileTap={tap}
      transition={spring.snappy}
      aria-pressed={on}
      aria-label={label}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!on)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full transition-tokens hover:bg-surface-3",
        compact ? "size-11" : "h-11 border border-border bg-surface-2 px-4 text-small font-medium",
      )}
    >
      {icon}
      {compact ? null : on ? "Favorito" : "Avisar quando abrir"}
    </motion.button>
  );
}
