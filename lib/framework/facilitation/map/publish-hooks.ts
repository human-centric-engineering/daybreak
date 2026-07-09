/**
 * Map post-publish hook seam (f-governance-plus t-4) — a tiny framework-LOCAL registry the map
 * version service fires after a publish tx commits, so higher layers (overlays' auto-embed) can react
 * without the map spine importing them.
 *
 * Why a registry, not a direct call: the map version service is the low-level spine; the overlays
 * layer is built ON it (`overlays/embed-sync` reads `getPublishedMap` from here). A direct
 * `version-service → embed-sync` call inverts that layering into a cycle. A core publish-event bus
 * (adding to Sunrise's `HOOK_EVENT_TYPES`) was rejected as a core edit for one internal consumer
 * (decision C). This local registry is the fork-lawful middle: the spine depends only on this hook
 * module (no overlay import), and the overlay registers its listener at `initFramework()` — the same
 * register-at-init idiom the framework uses everywhere else (`registerStepType`, contributors, …).
 *
 * Listeners are invoked synchronously and MUST be non-blocking (fire-and-forget) — `notifyMapPublished`
 * runs on the publish path, so a listener that awaits would extend the caller. A throwing listener is
 * isolated (logged), never propagated into the publish.
 */

import { logger } from '@/lib/logging';

/** Called after a map publish commits. `actorUserId` is null for a system/auto-approved publish. */
export type MapPublishListener = (slug: string, actorUserId: string | null) => void;

const listeners: MapPublishListener[] = [];

/** Register a post-publish listener (at `initFramework()`). Idempotent per distinct function ref. */
export function registerMapPublishListener(listener: MapPublishListener): void {
  if (!listeners.includes(listener)) listeners.push(listener);
}

/** Fire every registered listener after a publish commits. Non-throwing — a bad listener is isolated. */
export function notifyMapPublished(slug: string, actorUserId: string | null): void {
  for (const listener of listeners) {
    try {
      listener(slug, actorUserId);
    } catch (err) {
      logger.warn('Map publish listener threw (isolated)', {
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Test-only: clear registered listeners so each test starts from a known state. */
export function __resetMapPublishListenersForTests(): void {
  listeners.length = 0;
}
