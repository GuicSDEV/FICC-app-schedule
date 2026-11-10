/** The native app's store id (apps/mobile/capacitor.config.ts). */
const APP_ID = "br.com.ficctenis.app";

/**
 * iOS Universal Links: lets links to this site (tournaments, the app) open in the App Store app.
 * APP_LINKS_IOS_TEAM_ID is the Apple Developer Team ID (developer.apple.com → Membership).
 * See docs/MOBILE.md.
 */
export function GET(): Response {
  const team = process.env.APP_LINKS_IOS_TEAM_ID?.trim();
  const body = {
    applinks: {
      details: team
        ? [
            {
              appIDs: [`${team}.${APP_ID}`],
              components: [{ "/": "/t/*" }, { "/": "/app/*" }, { "/": "/app" }],
            },
          ]
        : [],
    },
  };
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
