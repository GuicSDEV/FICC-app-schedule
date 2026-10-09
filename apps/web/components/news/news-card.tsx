"use client";

import type { NewsPostItem } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Eye, Pencil, Pin, ThumbsUp, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { SimpleMarkdown } from "@/components/tournaments/simple-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { enter, haptic, popVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/**
 * One Mural post. It counts as read once half of it was on screen; members react with a 👍,
 * staff see how many members read it and can edit or remove it.
 */
export function NewsCard({
  post,
  compact = false,
  onEdit,
  onRemove,
  highlight = false,
}: {
  post: NewsPostItem;
  compact?: boolean;
  onEdit?: (post: NewsPostItem) => void;
  onRemove?: (post: NewsPostItem) => void;
  highlight?: boolean;
}) {
  const t = useTranslations("news");
  const format = useFormat();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const ref = useRef<HTMLElement>(null);
  const sent = useRef(post.readByMe);

  useEffect(() => {
    const node = ref.current;
    if (!node || sent.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !sent.current) {
          sent.current = true;
          void api.news.read(post.id).catch(() => (sent.current = false));
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [post.id]);

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  const react = useMutation({
    mutationFn: () => api.news.react(post.id),
    onMutate: async () => {
      haptic(8);
      await client.cancelQueries({ queryKey: queryKeys.news });
      const previous = client.getQueryData<NewsPostItem[]>(queryKeys.news);
      client.setQueryData<NewsPostItem[]>(queryKeys.news, (posts) =>
        posts?.map((item) =>
          item.id === post.id
            ? {
                ...item,
                reactedByMe: !item.reactedByMe,
                reactions: item.reactions + (item.reactedByMe ? -1 : 1),
              }
            : item,
        ),
      );
      return () => client.setQueryData(queryKeys.news, previous);
    },
    onError: (failure, _input, rollback) => {
      rollback?.();
      toast.error(errorMessage(failure));
    },
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.news }),
  });

  return (
    <article
      ref={ref}
      className={cn(
        "space-y-3 rounded-lg border bg-card p-4 shadow-card",
        post.pinned ? "border-primary/40" : "border-border",
        highlight && "ring-2 ring-primary",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {post.pinned ? (
              <Badge tone="ballSoft">
                <Pin />
                {t("pinned")}
              </Badge>
            ) : null}
            {post.eventDate ? (
              <Badge tone="lesson">
                <CalendarDays />
                {format.dayTitle(post.eventDate)}
              </Badge>
            ) : null}
          </div>
          <h2 className="font-display text-title font-semibold">{post.title}</h2>
          <p className="text-caption text-muted-foreground">
            {post.author.name} · {format.relative(post.publishedAt)}
          </p>
        </div>
        {onEdit || onRemove ? (
          <div className="flex shrink-0 gap-1">
            {onEdit ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("edit")}
                onClick={() => onEdit(post)}
              >
                <Pencil />
              </Button>
            ) : null}
            {onRemove ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("remove")}
                onClick={() => onRemove(post)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      <SimpleMarkdown
        source={post.body}
        className={cn("text-small leading-relaxed", compact && "line-clamp-4")}
      />
      {post.photoUrls.length > 0 && !compact ? (
        <div
          className={cn("grid gap-2", post.photoUrls.length > 1 ? "grid-cols-2" : "grid-cols-1")}
        >
          {post.photoUrls.map((url) => (
            <span
              key={url}
              className="relative aspect-video overflow-hidden rounded-md bg-surface-2"
            >
              <Image src={url} alt="" fill className="object-cover" unoptimized />
            </span>
          ))}
        </div>
      ) : null}
      <footer className="flex items-center gap-3">
        <motion.button
          type="button"
          whileTap={tap}
          aria-pressed={post.reactedByMe}
          onClick={() => react.mutate()}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full border px-3 text-small font-medium transition-tokens",
            post.reactedByMe
              ? "border-primary bg-ball-soft text-ball-ink"
              : "border-border hover:bg-surface-2",
          )}
        >
          <ThumbsUp aria-hidden className={cn("size-4", post.reactedByMe && "fill-current")} />
          <span className="sr-only">{t("like")}</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={post.reactions}
              variants={popVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              className="num"
            >
              {post.reactions}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        {post.readCount !== null ? (
          <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
            <Eye className="size-4" />
            {t("reads", { count: post.readCount })}
          </span>
        ) : null}
      </footer>
    </article>
  );
}
