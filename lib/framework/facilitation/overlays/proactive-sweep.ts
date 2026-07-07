/**
 * Proactive-guidance sweep (f-overlays t-3, spec §5.4, F13) — re-runs the (LLM-free) guidance
 * evaluation over stalled active journeys and returns the ones with a worthwhile next step to nudge.
 *
 * The nudge-worthy signal (t-3 default; a settings knob is a documented follow-up): a **stalled active**
 * journey (`listStalledActiveJourneys`) whose guidance yields a **`move`** focus recommendation — i.e.
 * a next step clears the ranking threshold. Journeys with only "linger" advice are left alone (nothing
 * pressing to nudge toward). Guidance runs under each journey's OWN viewer, so `canRead` holds per row.
 *
 * This is the compute half: it produces candidates. Delivery (email) + de-duplication (a throttle
 * table) + scheduling (a custom step type) arrive in t-3b; the on-demand admin trigger uses this to
 * PREVIEW who would be nudged.
 *
 * Cost: guidance is deterministic (no LLM, so no model spend), but each journey's `loadGuidance` runs
 * several reads plus — when the map has embeddings (t-2) — a similarity query per ranked move, and the
 * loop is sequential. So a sweep scales with journeys × moves in serial DB round-trips, bounded by
 * `maxJourneys` (default 100). It only reads (the sole write is a fire-and-forget audit row). The
 * scheduled path (t-3b) is where bounded-concurrency batching would earn its keep — and where journey
 * ordering/starvation (this reads oldest-started first) is resolved by the not-recently-nudged filter.
 */

import { loadGuidance } from '@/lib/framework/guidance/guidance';
import { suggestFocus } from '@/lib/framework/guidance/ranking';
import { listStalledActiveJourneys } from '@/lib/framework/facilitation/overlays/active-journeys';

/** How many days without a journey event before an active journey counts as stalled. Documented default. */
export const DEFAULT_STALLED_DAYS = 7;
/** Journeys scanned per sweep — bounds email volume (t-3b) and read cost. Documented default. */
export const DEFAULT_MAX_JOURNEYS = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ProactiveSweepArgs {
  /** A journey with no event since this instant is stalled. */
  stalledBefore: Date;
  /** Cap on journeys scanned this sweep. */
  maxJourneys: number;
}

/** One journey worth nudging, with the next step to surface. */
export interface NudgeCandidate {
  userId: string;
  journeyId: string;
  graphSlug: string;
  contextKey: string;
  /** The top next-step node to point the user at. */
  nodeKey: string;
  score: number;
  /** The deterministic focus reason — the source for the (t-3b) nudge copy. */
  reason: string;
}

export interface ProactiveSweepResult {
  /** Stalled active journeys examined. */
  scanned: number;
  candidates: NudgeCandidate[];
}

/** Resolve `stalledBefore` from a day count relative to `now` (helper for callers/tests). */
export function stalledBeforeFromDays(stalledDays: number, now: Date): Date {
  return new Date(now.getTime() - stalledDays * MS_PER_DAY);
}

/**
 * Scan stalled active journeys and return those with a nudge-worthy next step. Never throws per
 * journey — a journey whose guidance fails to load (e.g. its map was unpublished mid-sweep) is
 * skipped, so a partial result still comes back.
 */
export async function runProactiveGuidanceSweep(
  args: ProactiveSweepArgs
): Promise<ProactiveSweepResult> {
  const journeys = await listStalledActiveJourneys(args.stalledBefore, args.maxJourneys);
  const candidates: NudgeCandidate[] = [];

  for (const journey of journeys) {
    const viewer = { userId: journey.userId }; // self-viewer — canRead passes for the journey's owner
    const guidance = await loadGuidance(viewer, {
      userId: journey.userId,
      graphSlug: journey.graphSlug,
      contextKey: journey.contextKey,
    });
    if (guidance === null) continue; // nothing to guide (map unpublished / journey gone) — skip

    const focus = suggestFocus(guidance.moves);
    if (focus.recommendation === 'move' && focus.topMove) {
      candidates.push({
        userId: journey.userId,
        journeyId: journey.id,
        graphSlug: journey.graphSlug,
        contextKey: journey.contextKey,
        nodeKey: focus.topMove.nodeKey,
        score: focus.topMove.score,
        reason: focus.reason,
      });
    }
  }

  return { scanned: journeys.length, candidates };
}
