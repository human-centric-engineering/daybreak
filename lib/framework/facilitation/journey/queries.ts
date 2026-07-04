/**
 * Journey read queries (f-journey-state t-2) — the `canRead`-guarded reads the
 * deterministic engine (`f-engine`, 11) and guidance layer (`f-guidance`, 12)
 * consume over the journey-state tables. Mirrors `map/queries.ts`: raw `prisma`,
 * throws rather than swallowing, one testable place per read.
 *
 * **Every read routes through {@link canRead} first** (convention X2). The viewer
 * is gated against the *named* subject before any Prisma call — a denied read
 * throws `ForbiddenError` without touching the database. As a second, in-query
 * guard the node-state / timeline reads also constrain rows to the subject's
 * ownership (`journey.userId` / `JourneyEvent.userId`), so a caller that pairs a
 * `journeyId` with the wrong `subject` gets an empty result, never another user's
 * rows — the access decision and the row filter agree.
 *
 * This feature ships **no writer** — journey creation and state transitions are
 * `f-engine` (F11). These reads are the consumer side of the tables t-1 shipped.
 */

import type { UserJourney, UserNodeState, JourneyEvent } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ForbiddenError } from '@/lib/api/errors';
import { canRead, type JourneyViewer, type AccessScope } from '@/lib/framework/shared/access';

/** Identifies one journey by its natural `@@unique([userId, graphSlug, contextKey])` key. */
export interface JourneyKey {
  /** The owning user (the access subject). */
  userId: string;
  /** The map being walked. */
  graphSlug: string;
  /** Parallel-instance discriminator; `''` is the default, context-free journey (X3). */
  contextKey?: string;
}

/** Identifies journey-scoped rows (node states / events) plus their owning subject. */
export interface JourneyScopedKey {
  /** The journey these rows hang off (`UserJourney.id`). */
  journeyId: string;
  /** The journey owner's user id — the access subject `canRead` gates against. */
  subject: string;
}

/** Narrowing options for {@link getJourneyTimeline}. */
export interface JourneyTimelineOptions {
  /** Chronological (`'asc'`, default) or most-recent-first (`'desc'`). */
  order?: 'asc' | 'desc';
  /**
   * Non-negative cap on the number of events returned. Omitted ⇒ the full
   * timeline; `0` ⇒ none. Passed straight to Prisma `take`, so a **negative**
   * value takes rows from the *opposite* end of the ordering — callers must not
   * pass one.
   */
  limit?: number;
}

/**
 * One user's journey on a map, by its natural key — or `null` if they have not
 * started it (no writer yet; a fresh fork has none). The viewer is gated against
 * the journey's owner (`key.userId`) before any query runs.
 */
export async function getJourney(
  viewer: JourneyViewer,
  key: JourneyKey,
  scope?: AccessScope
): Promise<UserJourney | null> {
  if (!(await canRead(viewer, key.userId, scope))) {
    throw new ForbiddenError('Not permitted to read this journey');
  }
  return prisma.userJourney.findUnique({
    where: {
      userId_graphSlug_contextKey: {
        userId: key.userId,
        graphSlug: key.graphSlug,
        contextKey: key.contextKey ?? '',
      },
    },
  });
}

/**
 * The node-state projection for one journey, ordered by `nodeKey` for a stable
 * read. Gated on `key.subject`; the `journey.userId` filter also holds the rows to
 * that subject, so a `journeyId`/`subject` mismatch yields `[]` rather than another
 * user's states. Served by `@@unique([journeyId, nodeKey])`.
 */
export async function getNodeStates(
  viewer: JourneyViewer,
  key: JourneyScopedKey,
  scope?: AccessScope
): Promise<UserNodeState[]> {
  if (!(await canRead(viewer, key.subject, scope))) {
    throw new ForbiddenError('Not permitted to read this journey');
  }
  return prisma.userNodeState.findMany({
    where: { journeyId: key.journeyId, journey: { userId: key.subject } },
    orderBy: { nodeKey: 'asc' },
  });
}

/**
 * The event timeline for one journey (§5.2), ordered by `occurredAt` (chronological
 * by default) and served by `@@index([journeyId, occurredAt])`. Gated on
 * `key.subject`; the `userId` filter also holds the rows to that subject.
 */
export async function getJourneyTimeline(
  viewer: JourneyViewer,
  key: JourneyScopedKey,
  options?: JourneyTimelineOptions,
  scope?: AccessScope
): Promise<JourneyEvent[]> {
  if (!(await canRead(viewer, key.subject, scope))) {
    throw new ForbiddenError('Not permitted to read this journey');
  }
  return prisma.journeyEvent.findMany({
    where: { journeyId: key.journeyId, userId: key.subject },
    orderBy: { occurredAt: options?.order ?? 'asc' },
    ...(options?.limit !== undefined ? { take: options.limit } : {}),
  });
}
