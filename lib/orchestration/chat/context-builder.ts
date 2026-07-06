/**
 * Entity context builder
 *
 * Produces a stable `LOCKED CONTEXT` text block to splice into the
 * system prompt, given an entity `(contextType, contextId)` pair from
 * the chat request. Results are cached for 60 seconds per pair so
 * long-running conversations don't repeatedly re-fetch entities, and
 * the streaming handler calls `invalidateContext` after any capability
 * execution that could have mutated the underlying entity.
 *
 * Core supports only `contextType = "pattern"` as a built-in because
 * that's the only entity we have a clean loader for (`getPatternDetail`).
 * A fork can teach `buildContext` about additional types by registering
 * a loader via `registerContextContributor(type, loader)` — the fork-owned
 * `lib/app/context-contributors.ts` scaffold is auto-wired once before the
 * first lookup. Types with neither a built-in case nor a registered
 * contributor log a warn and return a benign placeholder (cached like any
 * other "no data" result) so the LLM sees "no context" rather than
 * hallucinating. A contributor that throws is caught and degraded to that
 * placeholder — a fork's loader error must not fail the chat turn — and that
 * errored-contributor placeholder alone is returned uncached, so a transient
 * loader failure self-heals on the next turn. Errors from the fork's one-time
 * init are likewise caught (contributors are simply disabled), never failing
 * a turn.
 */

import { logger } from '@/lib/logging';
import { getPatternDetail } from '@/lib/orchestration/knowledge/search';
import { initAppContextContributors } from '@/lib/app/context-contributors';

const CONTEXT_CACHE_TTL_MS = 60 * 1000;
const CONTEXT_CACHE_MAX_SIZE = 500;

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Per-request inputs a contributor may read, threaded from the chat handler. Generic —
 * core names no domain concept. `userId` lets a contributor return **per-user** context;
 * when present it is also part of the cache key (below), so one user's context is never
 * served to another. Absent ⇒ the entry is shared (prior behaviour). Extensible: new
 * generic fields (e.g. `conversationId`) can join without breaking existing contributors.
 */
export interface ContextRequest {
  userId?: string;
}

function cacheKey(type: string, id: string, userId?: string): string {
  return `${type}:${id}:${userId ?? ''}`;
}

/**
 * A prompt-context loader keyed by `contextType`. Returns the raw body
 * string to be framed as `LOCKED CONTEXT`; `buildContext` handles caching
 * and framing. Registered via `registerContextContributor`. The optional
 * `request` carries per-turn inputs (e.g. `userId`) for per-user context;
 * a contributor that ignores it stays shared/cached per `(type, id)`.
 */
type ContextContributor = (id: string, request?: ContextRequest) => Promise<string>;

const contributors = new Map<string, ContextContributor>();

/** Whether the auto-wired app contributor init (`lib/app/context-contributors.ts`) has run. */
let appInited = false;

/**
 * Register a prompt-context loader for a given `contextType`. Lets a fork
 * inject its own `LOCKED CONTEXT` block per turn without editing the core
 * `buildContext` switch. Idempotent by type: re-registering the same type
 * replaces the prior loader (mirrors the capability registry's per-slug
 * `register`). A built-in case (e.g. `"pattern"`) always takes precedence.
 *
 * This is the seam that lets a fork add context types without patching
 * core. Call it at module-import time (e.g. from
 * `lib/app/context-contributors.ts`), before the first dispatch.
 *
 * @see .context/orchestration/chat.md — the app-author guide
 */
export function registerContextContributor(type: string, loader: ContextContributor): void {
  contributors.set(type, loader);
}

/**
 * Run the fork's auto-wired contributor init exactly once, lazily, before
 * the first lookup. Mirrors the run-once-lazily *invocation shape* of
 * `initAppCapabilities()` in `registerBuiltInCapabilities` — the fork
 * accumulates registrations at import time without a separate startup step.
 * Error handling deliberately DIFFERS from that registry: this catches init
 * throws rather than letting them propagate (see the inline comment).
 */
function ensureAppContributorsInited(): void {
  if (appInited) return;
  // Latch BEFORE running so a throwing init neither retries on every lookup nor
  // propagates out of buildContext to fail the chat turn. An init failure is
  // caught and degrades to "no app contributors" (built-in types and the
  // placeholder path keep working), consistent with the loader-error contract
  // in the file header. This deliberately diverges from the capability registry
  // (which lets init throw): buildContext runs on the chat-turn hot path and
  // must not fail the turn over a fork's one-time init bug.
  appInited = true;
  try {
    initAppContextContributors();
  } catch (err) {
    logger.error(
      'buildContext: initAppContextContributors threw — app context contributors disabled',
      { error: err instanceof Error ? err.message : String(err) }
    );
  }
}

/**
 * Test-only: drop all registered contributors and re-arm the one-shot app
 * init so each test starts from a known state. Not exported from the barrel.
 */
export function __resetContextContributorsForTests(): void {
  contributors.clear();
  appInited = false;
}

/**
 * Load and frame context for the given entity, returning a string that
 * can be appended to the system prompt. Cached for 60 s per `(type, id, userId)` —
 * a `request.userId` scopes the cache so per-user contributor output never leaks
 * across users. Omit `request` (or its `userId`) for shared context (prior behaviour).
 */
export async function buildContext(
  type: string,
  id: string,
  request?: ContextRequest
): Promise<string> {
  const key = cacheKey(type, id, request?.userId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  ensureAppContributorsInited();

  let body: string;
  // Everything caches for the TTL EXCEPT the errored-contributor placeholder:
  // that one loader exists and may recover, so leaving it uncached lets a
  // transient failure self-heal on the next turn (the catch below flips this).
  let cacheable = true;
  switch (type) {
    case 'pattern': {
      const num = Number.parseInt(id, 10);
      if (!Number.isFinite(num)) {
        body = `Pattern id '${id}' is not numeric — no context available.`;
        break;
      }
      const detail = await getPatternDetail(num);
      if (detail.chunks.length === 0) {
        body = `Pattern #${num} not found in knowledge base.`;
      } else {
        const joined = detail.chunks
          .map((c) => `## ${c.section ?? 'section'}\n${c.content}`)
          .join('\n\n');
        body = `Pattern #${num}: ${detail.patternName ?? 'unnamed'}\n\n${joined}`;
      }
      break;
    }
    default: {
      // No built-in case — fall back to a fork-registered contributor for
      // this type before giving up. Keeps core domain-agnostic while
      // letting a fork add context types without editing this switch.
      const contributor = contributors.get(type);
      if (contributor) {
        try {
          body = await contributor(id, request);
        } catch (err) {
          // A contributor that throws must not fail the whole chat turn.
          // Degrade to the benign placeholder (uncached, so a transient
          // loader error self-heals on the next turn).
          logger.error('buildContext: context contributor threw', {
            type,
            id,
            error: err instanceof Error ? err.message : String(err),
          });
          body = `No context loader for type '${type}'.`;
          cacheable = false;
        }
      } else {
        // Unknown type with no loader — a deterministic "no data" answer for
        // client-controlled input. Cache it like the other placeholders so a
        // client repeatedly sending a bad `contextType` doesn't re-warn every
        // turn. (Contributors register at import time, so this can't "recover"
        // mid-conversation; the errored-contributor path above is the one that
        // needs to stay uncached.)
        logger.warn('buildContext: unknown contextType', { type, id });
        body = `No context loader for type '${type}'.`;
      }
    }
  }

  const framed = formatLockedContext(type, id, body);

  if (cacheable) {
    // Evict oldest entry if cache is at capacity
    if (cache.size >= CONTEXT_CACHE_MAX_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { value: framed, expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS });
  }
  return framed;
}

/** Drop the cache entry for a single entity. Pass the same `userId` used to build it to
 *  drop that user's per-user entry (omit for the shared entry). */
export function invalidateContext(type: string, id: string, userId?: string): void {
  cache.delete(cacheKey(type, id, userId));
}

/** Wipe the entire context cache. Mainly for tests and admin hooks. */
export function clearContextCache(): void {
  cache.clear();
}

function formatLockedContext(type: string, id: string, body: string): string {
  return [
    '=== LOCKED CONTEXT ===',
    `type: ${type}`,
    `id: ${id}`,
    '',
    body,
    '=== END LOCKED CONTEXT ===',
  ].join('\n');
}
