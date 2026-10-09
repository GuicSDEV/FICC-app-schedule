import { AsyncLocalStorage } from "node:async_hooks";

import type { ClubSettings, Locale } from "@ficc/shared";

/** The club a request (or a job run) works for, with its rules. */
export interface Tenant {
  clubId: string;
  slug: string;
  name: string;
  /** IANA zone for every club-local date and time. */
  timeZone: string;
  locale: Locale;
  settings: ClubSettings;
}

const storage = new AsyncLocalStorage<Tenant>();

/** Runs `work` with `tenant` as the current club (requests, socket events, jobs). */
export function runWithTenant<T>(tenant: Tenant, work: () => T): T {
  return storage.run(tenant, work);
}

/** The current club, or undefined outside a tenant context. */
export function tenantOrUndefined(): Tenant | undefined {
  return storage.getStore();
}

/** The current club; throws when called outside a tenant context (a programming error). */
export function tenant(): Tenant {
  const current = storage.getStore();
  if (!current) throw new Error("No club in context: wrap this call in runWithTenant().");
  return current;
}

/** Shorthands for the values services use all the time. */
export const clubTimeZone = (): string => tenant().timeZone;
export const clubSettings = (): ClubSettings => tenant().settings;
