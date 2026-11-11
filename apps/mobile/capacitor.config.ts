import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native apps open the deployed web app (one codebase, updated with every web deploy) and add
 * native features through Capacitor plugins. `APP_URL` is the public address of the web service
 * (e.g. https://app.ficc.com.br), read when running `cap sync`; without it the app shows the
 * bundled page in `www/`. See docs/MOBILE.md.
 */
const url = process.env.APP_URL?.replace(/\/+$/, "");

/**
 * Push needs the Firebase files (docs/MOBILE.md). Without them the iOS app would crash on launch,
 * so the plugin is only built into the apps once both files are in place.
 */
const firebaseReady =
  existsSync(join(__dirname, "ios/App/App/GoogleService-Info.plist")) &&
  existsSync(join(__dirname, "android/app/google-services.json"));

const PLUGINS = [
  "@capacitor/app",
  "@capacitor/haptics",
  "@capacitor/keyboard",
  "@capacitor/filesystem",
  "@capacitor/share",
  "@capacitor/splash-screen",
  "@capacitor/status-bar",
  ...(firebaseReady ? ["@capacitor-firebase/messaging"] : []),
];

const config: CapacitorConfig = {
  // Permanent store identifier: never change it after the first upload.
  appId: "br.com.ficctenis.app",
  appName: "FICC Tênis",
  webDir: "www",
  includePlugins: PLUGINS,
  backgroundColor: "#05103C",
  server: url
    ? {
        url,
        // Only for testing against a computer on the local network (http://192.168…:3000).
        cleartext: url.startsWith("http://"),
        // Bundled page shown when the site cannot be reached (no internet).
        errorPath: "offline.html",
      }
    : undefined,
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#05103C",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#05103C",
      overlaysWebView: true,
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
