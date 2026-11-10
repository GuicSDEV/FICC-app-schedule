/** The native app's store id (apps/mobile/capacitor.config.ts). */
const APP_ID = "br.com.ficctenis.app";

/**
 * Android App Links: lets links to this site (tournaments, the app) open in the Google Play app.
 * APP_LINKS_ANDROID_SHA256 is the SHA-256 fingerprint of the Play signing certificate (Play
 * Console → App integrity); several can be comma-separated. See docs/MOBILE.md.
 */
export function GET(): Response {
  const fingerprints = (process.env.APP_LINKS_ANDROID_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: APP_ID,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
