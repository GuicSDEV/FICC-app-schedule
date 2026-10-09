import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintView } from "@/components/tournaments/print-view";
import { fetchPublicTournament } from "@/lib/public-tournament";

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ view?: string; category?: string; date?: string }>;
};

export const metadata: Metadata = { robots: { index: false } };

/** Printable draw (?view=draw&category=…) or day order of play (?view=day&date=…). */
export default async function PrintPage({ params, searchParams }: Props) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  const data = await fetchPublicTournament(publicId);
  if (!data) notFound();
  return (
    <PrintView
      data={data}
      view={query.view === "day" ? "day" : "draw"}
      categoryId={query.category}
      date={query.date}
    />
  );
}
