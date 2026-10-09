"use client";

import type { NotificationItem } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useSocketEvent } from "@/components/providers/socket-provider";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { listItemVariants, popVariants, tap } from "@/lib/motion";
import { describeNotification, type NotificationTone } from "@/lib/notifications";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<NotificationTone, string> = {
  ball: "bg-ball",
  lesson: "bg-lesson",
  danger: "bg-danger",
  warning: "bg-warning",
  neutral: "bg-muted-foreground",
};

/** Bell with an animated unread badge; opens the notification center. Live via socket. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications.list });
  const unread = data?.unreadCount ?? 0;

  useSocketEvent("notification.created", (notification: NotificationItem) => {
    // Elo results get their own celebration screen; everything else gets a toast.
    if (notification.type === "MATCH_CONFIRMED") return;
    const copy = describeNotification(notification);
    toast(copy.title, {
      description: copy.body,
      action: copy.href ? { label: "Ver", onClick: () => router.push(copy.href!) } : undefined,
    });
  });

  const readAll = useMutation({
    mutationFn: api.notifications.readAll,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
  const readOne = useMutation({
    mutationFn: api.notifications.read,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.notifications }),
  });

  function openItem(item: NotificationItem) {
    const copy = describeNotification(item);
    if (!item.readAt) readOne.mutate(item.id);
    if (copy.href) {
      setOpen(false);
      router.push(copy.href);
    }
  }

  return (
    <>
      <motion.button
        type="button"
        whileTap={tap}
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"}
        className="relative inline-flex size-11 items-center justify-center rounded-full text-foreground hover:bg-surface-2"
      >
        <Bell className="size-[22px]" />
        <AnimatePresence>
          {unread > 0 ? (
            <motion.span
              key={unread}
              variants={popVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="num absolute top-1.5 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground ring-2 ring-background"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Notificações"
        footer={
          unread > 0 ? (
            <Button variant="secondary" block onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Marcar todas como lidas
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-16" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={BellOff} title="Tudo em dia" description="Convites, resultados e avisos aparecem aqui." />
        ) : (
          <ul className="-mx-2 space-y-1">
            {data.items.map((item, index) => {
              const copy = describeNotification(item);
              return (
                <motion.li key={item.id} custom={index} variants={listItemVariants} initial="hidden" animate="show">
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "flex w-full gap-3 rounded-md px-3 py-3 text-left transition-tokens hover:bg-surface-2",
                      !item.readAt && "bg-surface-2/60",
                    )}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : TONE_DOT[copy.tone])} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-small font-semibold">{copy.title}</span>
                        <span className="shrink-0 text-caption text-muted-foreground">{formatRelative(item.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-small text-muted-foreground">{copy.body}</span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
