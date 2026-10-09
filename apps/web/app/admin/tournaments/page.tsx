"use client";

import { useQuery } from "@tanstack/react-query";
import { ListOrdered, Plus, Trophy } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TournamentFormSheet } from "@/components/tournaments/manager/tournament-form-sheet";
import { TournamentCard } from "@/components/tournaments/tournament-card";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

export default function AdminTournamentsPage() {
  const t = useTranslations("tournaments.admin");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // Admins see every tournament, drafts included (no status filter).
  const list = useQuery({
    queryKey: queryKeys.tournaments.list("admin"),
    queryFn: () => api.tournaments.list(),
  });

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Link
              href="/admin/circuits"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-small font-medium hover:bg-surface-3"
            >
              <ListOrdered className="size-4" />
              {t("circuits")}
            </Link>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              {t("create")}
            </Button>
          </>
        }
      />
      <div className="mt-5 space-y-4">
        {list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Skeleton className="h-44 rounded-lg" />
            <Skeleton className="h-44 rounded-lg" />
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={<Button onClick={() => setCreating(true)}>{t("create")}</Button>}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.data!.map((tournament, index) => (
              <motion.li
                key={tournament.id}
                custom={index}
                variants={listItemVariants}
                initial="hidden"
                animate="show"
              >
                <TournamentCard
                  tournament={tournament}
                  href={`/admin/tournaments/${tournament.id}`}
                />
              </motion.li>
            ))}
          </ul>
        )}
      </div>
      <TournamentFormSheet
        open={creating}
        tournament={null}
        onOpenChange={setCreating}
        onSaved={(saved) => router.push(`/admin/tournaments/${saved.id}`)}
      />
    </>
  );
}
