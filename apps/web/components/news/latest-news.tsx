"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { SectionLabel } from "@/components/ui/card";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { NewsCard } from "./news-card";

/** Dashboard section: the latest pinned Mural post (or the newest one). */
export function LatestNews() {
  const t = useTranslations("news");
  const news = useQuery({ queryKey: queryKeys.news, queryFn: api.news.list, staleTime: 60_000 });
  const post = news.data?.find((item) => item.pinned) ?? news.data?.[0];
  if (!post) return null;
  return (
    <section className="space-y-3" aria-label={t("title")}>
      <div className="flex items-center justify-between">
        <SectionLabel>{t("title")}</SectionLabel>
        <Link
          href="/app/news"
          className="inline-flex min-h-11 items-center text-caption font-medium text-accent-ink hover:underline"
        >
          {t("all")}
        </Link>
      </div>
      <NewsCard post={post} compact />
    </section>
  );
}
