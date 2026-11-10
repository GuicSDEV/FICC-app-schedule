import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Brand } from "@/components/shell/brand";
import { getClub } from "@/lib/club-server";

interface Section {
  title: string;
  body: string[];
}

/**
 * A public legal page (privacy policy, terms of use): reachable without logging in, from the app
 * and from the store listings. Text in messages under legal.<kind>; {club}, {contact} and
 * {retentionDays} are filled from the club and the environment.
 */
export async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const t = await getTranslations("legal");
  const club = await getClub();
  const contact = process.env.LEGAL_CONTACT_EMAIL?.trim() || t("contactFallback");
  const values: Record<string, string> = {
    club: club?.name ?? t("clubFallback"),
    contact,
    retentionDays: String(club?.settings.guestDataRetentionDays ?? 90),
  };
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  const sections = t.raw(`${kind}.sections`) as Section[];

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Brand />
        </Link>
      </header>
      <main className="mt-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-headline font-bold">{t(`${kind}.title`)}</h1>
          <p className="text-small text-muted-foreground">{t("updated")}</p>
          <p className="text-body text-muted-foreground">
            {fill(t.raw(`${kind}.intro`) as string)}
          </p>
        </div>
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-title font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-body leading-relaxed text-muted-foreground">
                {fill(paragraph)}
              </p>
            ))}
          </section>
        ))}
        <nav className="flex gap-4 border-t border-border pt-6 text-small">
          <Link href="/privacidade" className="text-accent-ink underline-offset-4 hover:underline">
            {t("privacy.title")}
          </Link>
          <Link href="/termos" className="text-accent-ink underline-offset-4 hover:underline">
            {t("terms.title")}
          </Link>
        </nav>
      </main>
    </div>
  );
}
