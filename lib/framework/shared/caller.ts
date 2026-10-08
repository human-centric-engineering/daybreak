/**
 * Who a framework tool is acting for — the one check every framework capability that reads or
 * writes "the caller's own" rows makes before touching the database.
 *
 * Two callers have no rows of their own and are refused by name:
 *
 * - **No user** (`context.userId === null`) — a system-initiated run: a schedule, a workflow step.
 *   Refused with `no_user_context`.
 * - **An anonymous embed widget visitor** — `context.userId` is an `embed_<hash>` id, not a `User`
 *   (Sunrise #705, t-765). A write keyed on it fails on the `User` foreign key, and a read returns
 *   an empty result that would pass for a real user's. Refused with `anonymous_visitor`, the code
 *   core's own tools use (`read_user_memory`, `add_provider_models`, …).
 *
 * Returning the narrowed `userId` (rather than a boolean) is deliberate: a caller that uses the
 * result cannot reach `context.userId` unchecked, so a new tool cannot forget the visitor case the
 * way a second, separate `isEmbedUserId` check can be forgotten.
 */

import { isEmbedUserId } from '@/lib/embed/auth';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';

/** The outcome of {@link checkUserCaller}: the caller's user id, or the refusal to return. */
export type UserCallerCheck =
  | { ok: true; userId: string }
  | { ok: false; code: 'no_user_context' | 'anonymous_visitor'; message: string };

/**
 * Resolve the signed-in user a capability acts for, or the refusal to return.
 *
 * `feature` names what is unavailable in the refusal message ("Slot capture", "Guidance").
 */
export function checkUserCaller(
  context: Pick<CapabilityContext, 'userId'>,
  feature: string
): UserCallerCheck {
  if (context.userId === null) {
    return {
      ok: false,
      code: 'no_user_context',
      message: `${feature} is unavailable for system-initiated runs (no user context).`,
    };
  }
  if (isEmbedUserId(context.userId)) {
    return {
      ok: false,
      code: 'anonymous_visitor',
      message: `${feature} is unavailable to anonymous embed widget visitors.`,
    };
  }
  return { ok: true, userId: context.userId };
}
