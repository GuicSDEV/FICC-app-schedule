import { useSyncExternalStore } from "react";

/** Chrome / Edge / Android: the deferred install prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Called once at start: registers the service worker (production) and keeps the install prompt. */
export function startPwa(): void {
  if (typeof window === "undefined" || started) return;
  started = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
  // In development the service worker would fight hot reload.
  if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }
}

/** Drops cached API answers and pages (logout, account switch). */
export function clearOfflineData(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage("clear-user-data");
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad Safari: no install prompt, the person adds the app from the share sheet. */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** How this device can install the app: a prompt, iOS instructions, or not at all. */
export function useInstall(): { mode: "prompt" | "ios" | null; install: () => Promise<boolean> } {
  const available = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  );
  const mode = isStandalone() ? null : available ? "prompt" : isIosSafari() ? "ios" : null;
  return {
    mode,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      emit();
      return choice.outcome === "accepted";
    },
  };
}
