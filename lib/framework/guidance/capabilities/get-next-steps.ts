/**
 * `get_next_steps` (f-guidance t-2, spec §5.4) — the engine's `validMoves`, **ranked**
 * wisest-first with a reason per move (F12: guidance ranks what is wise). A path agent
 * calls this to decide which eligible step to surface. Not silent — it shapes the reply.
 *
 * Each move carries the ranking reasons (which reference authored slot slugs + node keys,
 * never a captured slot value) and an empty `related` slot `f-overlays` (19) fills.
 */

import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import type { RankedMove } from '@/lib/framework/guidance/ranking';
import { loadGuidance } from '@/lib/framework/guidance/guidance';
import {
  journeyArgsSchema,
  journeyArgProperties,
  journeyRequest,
  hasUserContext,
  NO_USER_CONTEXT_MESSAGE,
  type JourneyArgs,
} from '@/lib/framework/guidance/capabilities/shared';

interface NextStepsData {
  journeyStarted: boolean;
  moves: readonly RankedMove[];
}

export class GetNextStepsCapability extends BaseCapability<JourneyArgs, NextStepsData> {
  readonly slug = 'get_next_steps';

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_next_steps',
    description:
      'Get the legal next steps in a facilitation map, ranked wisest-first with a reason for each (recency of relevant readings, new areas, soft deadlines). Use this to decide which step to surface — never invent steps.',
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
  ): Promise<CapabilityResult<NextStepsData>> {
    if (!hasUserContext(context)) return this.error(NO_USER_CONTEXT_MESSAGE, 'no_user_context');

    const { viewer, key } = journeyRequest(args, context.userId);
    const guidance = await loadGuidance(viewer, key);
    if (guidance === null) return this.success({ journeyStarted: false, moves: [] });

    return this.success({ journeyStarted: true, moves: guidance.moves });
  }
}
