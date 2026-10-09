import type { ClubInfo } from "@ficc/shared";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers/providers";
import { API_PREFIX, API_URL } from "@/lib/api";

import "./globals.css";

/** Display face for headlines, player names and the giant Elo number. */
const bricolage = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

/** Pages re-read the club's name (titles) at most every 5 minutes. */
export const revalidate = 300;

/** The club's name for titles; the build does not need the API (pages revalidate later). */
async function clubName(): Promise<string | null> {
  // Set by Next.js itself during `next build`, not by our environment.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const response = await fetch(`${API_URL}${API_PREFIX}/club`, { next: { revalidate: 300 } });
    return response.ok ? ((await response.json()) as ClubInfo).name : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  const club = await clubName();
  const title = club ? t("title", { club }) : t("brandFallback");
  return {
    title: { default: title, template: `%s · ${title}` },
    description: t("description"),
    applicationName: title,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0F0D" },
    { media: "(prefers-color-scheme: light)", color: "#F7F6F2" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {/* vaul scales this wrapper behind open sheets. */}
            <div {...{ "vaul-drawer-wrapper": "" }} className="min-h-dvh bg-background">
              {children}
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
