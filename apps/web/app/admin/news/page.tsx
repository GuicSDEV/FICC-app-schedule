"use client";

import { newsPostSchema, type NewsPostItem } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Newspaper, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { NewsCard } from "@/components/news/news-card";
import { Button } from "@/components/ui/button";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

function PostSheet({
  open,
  post,
  onOpenChange,
}: {
  open: boolean;
  /** Null to write a new post. */
  post: NewsPostItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminNews");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const [notify, setNotify] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(post?.title ?? "");
    setBody(post?.body ?? "");
    setPhotos((post?.photoUrls ?? []).join("\n"));
    setEventDate(post?.eventDate ?? "");
    setPinned(post?.pinned ?? false);
    setNotify(!post);
    setTouched(false);
    // Reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const input = {
    title,
    body,
    photoUrls: photos
      .split(/\s+/)
      .map((url) => url.trim())
      .filter(Boolean),
    eventDate: eventDate || null,
    pinned,
    notify,
  };
  const check = newsPostSchema.safeParse(input);
  const issue = (field: string) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path[0] === field);
    return found ? issueMessage(found) : undefined;
  };
  const save = useMutation({
    mutationFn: () => {
      const { notify: _notify, ...changes } = input;
      return post ? api.news.update(post.id, changes) : api.news.create(input);
    },
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(post ? t("saved") : notify ? t("publishedNotified") : t("published"));
      void client.invalidateQueries({ queryKey: queryKeys.news });
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={post ? t("editTitle") : t("newTitle")}
      footer={
        <Button
          size="lg"
          block
          loading={save.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success) save.mutate();
          }}
        >
          {post ? t("save") : t("publish")}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label={t("postTitle")} htmlFor="news-title" error={issue("title")}>
          <Input id="news-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label={t("body")} htmlFor="news-body" error={issue("body")} hint={t("bodyHint")}>
          <Textarea
            id="news-body"
            className="min-h-40"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <Field label={t("eventDate")} htmlFor="news-event" error={issue("eventDate")}>
          <Input
            id="news-event"
            type="date"
            className="num"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
          />
        </Field>
        <Field
          label={t("photos")}
          htmlFor="news-photos"
          error={issue("photoUrls")}
          hint={t("photosHint")}
        >
          <Textarea
            id="news-photos"
            value={photos}
            onChange={(event) => setPhotos(event.target.value)}
            placeholder="https://"
          />
        </Field>
        <ChipGroup label={t("options")}>
          <ChoiceChip selected={pinned} showCheck onClick={() => setPinned((value) => !value)}>
            {t("pin")}
          </ChoiceChip>
          {!post ? (
            <ChoiceChip selected={notify} showCheck onClick={() => setNotify((value) => !value)}>
              {t("notify")}
            </ChoiceChip>
          ) : null}
        </ChipGroup>
      </div>
    </Sheet>
  );
}

export default function AdminNewsPage() {
  const t = useTranslations("adminNews");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const news = useQuery({ queryKey: queryKeys.news, queryFn: api.news.list });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsPostItem | null>(null);
  const [removing, setRemoving] = useState<NewsPostItem | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.news.remove(id),
    onSuccess: () => {
      toast(t("removed"));
      setRemoving(null);
      void client.invalidateQueries({ queryKey: queryKeys.news });
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus />
            {t("new")}
          </Button>
        }
      />
      <div className="mt-5 max-w-2xl space-y-3">
        {news.isError ? (
          <ErrorState onRetry={() => void news.refetch()} />
        ) : !news.data ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : news.data.length === 0 ? (
          <EmptyState icon={Newspaper} title={t("emptyTitle")} />
        ) : (
          news.data.map((post, index) => (
            <motion.div
              key={post.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <NewsCard
                post={post}
                onEdit={(item) => {
                  setEditing(item);
                  setOpen(true);
                }}
                onRemove={setRemoving}
              />
            </motion.div>
          ))
        )}
      </div>
      <PostSheet open={open} post={editing} onOpenChange={setOpen} />
      <Sheet
        open={removing !== null}
        onOpenChange={(value) => !value && setRemoving(null)}
        title={t("removeTitle")}
        description={removing?.title}
        footer={
          <Button
            variant="danger"
            size="lg"
            block
            loading={remove.isPending}
            onClick={() => removing && remove.mutate(removing.id)}
          >
            {t("removeConfirm")}
          </Button>
        }
      >
        {null}
      </Sheet>
    </>
  );
}
