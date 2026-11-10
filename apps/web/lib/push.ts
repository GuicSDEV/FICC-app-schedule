import { Capacitor, type PluginListenerHandle, registerPlugin } from "@capacitor/core";

import { api } from "@/lib/api";

import { isNativeApp, nativePlatform } from "./native";
import { isIosSafari, isStandalone } from "./pwa";

/**
 * @capacitor-firebase/messaging, reached through the native bridge (its web build needs the
 * Firebase JS SDK, which the site does not use). Only the calls the app makes.
 */
interface FirebaseMessagingPlugin {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  getToken(): Promise<{ token: string }>;
  deleteToken(): Promise<void>;
  addListener(
    event: "notificationActionPerformed",
    listener: (event: { notification: { data?: { url?: string } } }) => void,
  ): Promise<PluginListenerHandle>;
}
const FirebaseMessaging = registerPlugin<FirebaseMessagingPlugin>("FirebaseMessaging");
const NATIVE_TOKEN_KEY = "ficc:native-push-token";

/** Native app built with Firebase (docs/MOBILE.md); otherwise push is off in the app. */
const nativePushAvailable = () => isNativeApp() && Capacitor.isPluginAvailable("FirebaseMessaging");

/** "granted", "denied" or "prompt" for this device's notifications. */
export async function pushPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (nativePushAvailable()) {
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive === "granted" || receive === "denied" ? receive : "prompt";
  }
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

/** Opens the screen of a notification the person tapped in the native app. */
export async function onNativeNotificationTap(
  navigate: (path: string) => void,
): Promise<(() => void) | null> {
  if (!nativePushAvailable()) return null;
  const handle = await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
    const url = event.notification.data?.url;
    if (url?.startsWith("/")) navigate(url);
  });
  return () => void handle.remove();
}

function savedNativeToken(): string | null {
  try {
    return localStorage.getItem(NATIVE_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** "supported", or why this device cannot get notifications (iPhone: only from the installed app). */
export type PushSupport = "supported" | "needs-install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeApp()) return nativePushAvailable() ? "supported" : "unsupported";
  const capable =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (capable && (!isIosSafari() || isStandalone())) return "supported";
  // iPhone Safari offers push only to apps added to the home screen (iOS 16.4+).
  if (isIosSafari() && !isStandalone()) return "needs-install";
  return "unsupported";
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

/** Whether this device already gets the signed-in person's notifications. */
export async function isPushEnabled(): Promise<boolean> {
  if (pushSupport() !== "supported" || (await pushPermission()) !== "granted") return false;
  if (isNativeApp()) return savedNativeToken() !== null;
  const subscription = await (await registration())?.pushManager.getSubscription();
  return Boolean(subscription);
}

/**
 * Asks for permission (must follow a tap) and registers this device. Returns false when the
 * person refused, push is off on the server, or the browser cannot do it.
 */
export async function enablePush(): Promise<boolean> {
  if (pushSupport() !== "supported") return false;
  if (isNativeApp()) {
    if ((await FirebaseMessaging.requestPermissions()).receive !== "granted") return false;
    const { token } = await FirebaseMessaging.getToken();
    await api.push.registerDevice({
      token,
      platform: nativePlatform() === "ios" ? "IOS" : "ANDROID",
    });
    try {
      localStorage.setItem(NATIVE_TOKEN_KEY, token);
    } catch {
      // Private storage off: the switch shows off next time, push still works.
    }
    return true;
  }
  const { publicKey } = await api.push.key();
  if (!publicKey) return false;
  if ((await Notification.requestPermission()) !== "granted") return false;
  const worker = (await registration()) ?? (await navigator.serviceWorker.ready);
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = subscription.toJSON();
  await api.push.subscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  });
  return true;
}

/** Stops notifications on this device (also on logout, so the next person does not get them). */
export async function disablePush(): Promise<void> {
  if (isNativeApp()) {
    const token = savedNativeToken();
    if (!token) return;
    await api.push.removeDevice(token).catch(() => undefined);
    if (nativePushAvailable()) await FirebaseMessaging.deleteToken().catch(() => undefined);
    try {
      localStorage.removeItem(NATIVE_TOKEN_KEY);
    } catch {
      // Nothing stored.
    }
    return;
  }
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await api.push.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}
