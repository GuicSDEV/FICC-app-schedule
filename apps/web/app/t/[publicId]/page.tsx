import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PublicTournamentView } from "@/components/tournaments/public-tournament-view";
import { fetchPublicTournament } from "@/lib/public-tournament";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const data = await fetchPublicTournament(publicId);
  if (!data) return {};
  const t = await getTranslations("tournaments.public");
  const description = t("description", {
    club: data.clubName,
    categories: data.tournament.categories.map((category) => category.name).join(", "),
  });
  return {
    title: data.tournament.name,
    description,
    openGraph: {
      title: data.tournament.name,
      description,
      siteName: data.clubName,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: data.tournament.name, description },
  };
}

/** Public, read-only tournament page (shared on WhatsApp): no login needed. */
export default async function PublicTournamentPage({ params }: Props) {
  const { publicId } = await params;
  const data = await fetchPublicTournament(publicId);
  if (!data) notFound();
  return <PublicTournamentView publicId={publicId} initial={data} />;
}
