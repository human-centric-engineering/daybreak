/**
 * `getPublishedGraph` — bind a {@link GraphStore} to a slug's live published map
 * (f-engine t-1). The one DB-touching entry in the engine's topology layer: it
 * fetches + parses via the shipped `getPublishedMap` and wraps the result in the
 * in-memory store.
 *
 * Split from the pure `graph-store.ts` (F2 / B12) so that module's traversal tests
 * need no DB — this file imports `map/version-service` (→ `@/lib/db/client`), that
 * one imports nothing but types. Per F2, the store is built over the *currently
 * published* version each call; the engine never pins a journey to a version id,
 * so republishing is picked up on the next read.
 */

import { getPublishedMap } from '@/lib/framework/facilitation/map/version-service';
import {
  inMemoryGraphStore,
  type GraphStore,
} from '@/lib/framework/facilitation/engine/graph-store';

/**
 * The {@link GraphStore} over the live published version of map `slug`, or `null`
 * when the map does not exist or has no published version yet (a fresh fork). A
 * corrupt stored definition surfaces as a parse error from `getPublishedMap` rather
 * than a malformed store.
 */
export async function getPublishedGraph(slug: string): Promise<GraphStore | null> {
  const map = await getPublishedMap(slug);
  if (!map) return null;
  return inMemoryGraphStore(map.definition);
}
