/**
 * `get_progress_synopsis` (f-guidance t-2, spec §5.4) — a deterministic digest of the
 * journey's standing (status tally, milestones reached, recent transitions) a synopsis
 * agent narrates from. The digest is pure (guidance never calls an LLM — decision 2); the
 * agent renders the prose, so this is not silent.
 *
 * Surfaces node keys + event types + timestamps only — no captured slot value — so it is
 * not `processesPii`.
 */

import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import type { ProgressSynopsis } from '@/lib/framework/guidance/synopsis';
import { loadProgressSynopsis } from '@/lib/framework/guidance/guidance';
import {
  journeyArgsSchema,
  journeyArgProperties,
  journeyRequest,
  hasUserContext,
  NO_USER_CONTEXT_MESSAGE,
  type JourneyArgs,
} from '@/lib/framework/guidance/capabilities/shared';

interface ProgressSynopsisData {
  journeyStarted: boolean;
  synopsis: ProgressSynopsis | null;
}

export class GetProgressSynopsisCapability extends BaseCapability<
  JourneyArgs,
  ProgressSynopsisData
> {
  readonly slug = 'get_progress_synopsis';

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_progress_synopsis',
    description:
      "A digest of the user's progress through a facilitation map: how many nodes are completed/active, which milestones were reached, and the most recent transitions. Use it to summarise where things stand.",
    parameters: {
      type: 'object',
      properties: { ...journeyArgProperties },
      required: ['graphSlug'],
    },
  };

  protected readonly schema = journeyArgsSchema;

  async execute(
    args: JourneyArgs,
    context: CapabilityContext
  ): Promise<CapabilityResult<ProgressSynopsisData>> {
    if (!hasUserContext(context)) return this.error(NO_USER_CONTEXT_MESSAGE, 'no_user_context');

    const { viewer, key } = journeyRequest(args, context.userId);
    const synopsis = await loadProgressSynopsis(viewer, key);
    if (synopsis === null) return this.success({ journeyStarted: false, synopsis: null });

    return this.success({ journeyStarted: true, synopsis });
  }
}
