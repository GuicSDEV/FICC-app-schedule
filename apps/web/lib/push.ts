import { api } from "@/lib/api";

import { isIosSafari, isStandalone } from "./pwa";

/** "supported", or why this device cannot get notifications (iPhone: only from the installed app). */
export type PushSupport = "supported" | "needs-install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
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
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return false;
  const subscription = await (await registration())?.pushManager.getSubscription();
  return Boolean(subscription);
}

/**
 * Asks for permission (must follow a tap) and registers this device. Returns false when the
 * person refused, push is off on the server, or the browser cannot do it.
 */
export async function enablePush(): Promise<boolean> {
  if (pushSupport() !== "supported") return false;
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
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await api.push.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}
