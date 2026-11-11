import { Capacitor } from "@capacitor/core";

/**
 * Native app bridge (apps/mobile, Capacitor). The site runs the same everywhere; inside the iOS or
 * Android app these helpers use the phone's own features instead of the browser's. Plugins are
 * loaded on demand so the web bundle stays the same size for browsers.
 */

/** True inside the FICC Tênis app from the App Store or Google Play. */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  return typeof window === "undefined" ? "web" : (Capacitor.getPlatform() as "ios" | "android");
}

/** A light tap, or a success buzz for a pattern (confirmations). */
export async function nativeHaptic(kind: "tap" | "success"): Promise<void> {
  const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
  if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
  else await Haptics.impact({ style: ImpactStyle.Light });
}

/** The system share sheet with a link or text. Resolves false when the person closes it. */
export async function nativeShare(input: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  const { Share } = await import("@capacitor/share");
  try {
    await Share.share({ ...input, dialogTitle: input.title });
    return true;
  } catch {
    return false;
  }
}

/** Shares an image (e.g. a guest pass): written to the app's cache, then the share sheet. */
export async function nativeShareImage(
  blob: Blob,
  fileName: string,
  share: { title: string; text: string },
): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const written = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  try {
    await Share.share({ title: share.title, text: share.text, files: [written.uri] });
    return true;
  } catch {
    return false;
  }
}

/** Status bar text color to match the theme (light text on the dark theme). */
export async function nativeStatusBar(theme: "dark" | "light"): Promise<void> {
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
}

/**
 * App-wide native wiring: no form bar above the iPhone keyboard, Android back button walks the history (and leaves the app on the first
 * screen), and links that open the app (tournaments, guest passes) go to their page. Returns a
 * cleanup function.
 */
export async function startNativeShell(navigate: (path: string) => void): Promise<() => void> {
  const [{ App }, { SplashScreen }, { Keyboard }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/splash-screen"),
    import("@capacitor/keyboard"),
  ]);
  // iPhone: no "‹ › Done" bar above the keyboard (a web form thing, not an app one).
  if (nativePlatform() === "ios") {
    await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
  }
  const handles = await Promise.all([
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    }),
    App.addListener("appUrlOpen", ({ url }) => {
      try {
        const target = new URL(url);
        navigate(`${target.pathname}${target.search}${target.hash}`);
      } catch {
        // Not a link the app understands.
      }
    }),
  ]);
  await SplashScreen.hide();
  return () => handles.forEach((handle) => void handle.remove());
}
