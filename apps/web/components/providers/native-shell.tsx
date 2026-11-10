"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import { isNativeApp, nativeStatusBar, startNativeShell } from "@/lib/native";
import { onNativeNotificationTap } from "@/lib/push";

/**
 * Inside the App Store / Google Play app: Android back button, links and notification taps that
 * open a screen, and the status bar following the theme. Renders nothing; does nothing in browsers.
 */
export function NativeShell() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!isNativeApp()) return;
    let stopped = false;
    const cleanups: (() => void)[] = [];
    const navigate = (path: string) => router.push(path);
    void Promise.all([startNativeShell(navigate), onNativeNotificationTap(navigate)]).then(
      (handles) => {
        for (const handle of handles) {
          if (!handle) continue;
          if (stopped) handle();
          else cleanups.push(handle);
        }
      },
    );
    return () => {
      stopped = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [router]);

  useEffect(() => {
    if (!isNativeApp() || !resolvedTheme) return;
    void nativeStatusBar(resolvedTheme === "light" ? "light" : "dark").catch(() => undefined);
  }, [resolvedTheme]);

  return null;
}
