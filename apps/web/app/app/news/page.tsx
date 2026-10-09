"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { NewsCard } from "@/components/news/news-card";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

function NewsFeed() {
  const t = useTranslations("news");
  const client = useQueryClient();
  const highlight = useSearchParams().get("post");
  const news = useQuery({ queryKey: queryKeys.news, queryFn: api.news.list });
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/app/profile" />
          </>
        }
      />
      <PullToRefresh onRefresh={() => client.invalidateQueries({ queryKey: queryKeys.news })}>
        <div className="mx-auto mt-5 max-w-2xl space-y-3 pb-6">
          {news.isError ? (
            <ErrorState onRetry={() => void news.refetch()} />
          ) : !news.data ? (
            <>
              <Skeleton className="h-40 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
            </>
          ) : news.data.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            news.data.map((post, index) => (
              <motion.div
                key={post.id}
                custom={index}
                variants={listItemVariants}
                initial="hidden"
                animate="show"
              >
                <NewsCard post={post} highlight={post.id === highlight} />
              </motion.div>
            ))
          )}
        </div>
      </PullToRefresh>
    </>
  );
}

export default function NewsPage() {
  return (
    <Suspense>
      <NewsFeed />
    </Suspense>
  );
}
