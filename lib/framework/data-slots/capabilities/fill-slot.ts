/**
 * `fill_slot` capability (f-slot-capture t-2) — the write half: an agent persists a new
 * reading about the user into their data-slots (spec §6.1). A silent tool (D5) the agent
 * calls mid-conversation when it learns something worth remembering.
 *
 * Writes the **caller's own** slots (`context.userId` → `appendSlotValue.userId`), so
 * there is no cross-user write and no `canRead` on this path (that guard is for reads).
 * It fills the two seams the shipped value engine deliberately left open:
 * - **Slug validation / open-mode minting.** `appendSlotValue` does not validate
 *   `slotSlug` and `SlotValue.slotSlug` is not an FK — so this capability decides:
 *   a slug with an **active** `SlotDefinition` is a *targeted* append; a **retired**
 *   (inactive) definition is refused; a slug with **no** definition is an *open-mode*
 *   mint (a free-form capture the system learns), logged for observability. Per-agent
 *   scoping of what may be written is t-4.
 * - **P2002 retry.** `appendSlotValue` computes the next version and does not retry a
 *   concurrent same-slug append (the loser hits `@@unique([userId, slotSlug, version])`);
 *   `fill_slot` catches P2002 once and re-runs off the fresh head.
 *
 * The typed `valueJson` extraction (#307) and sensitivity masking are **t-3**; t-2
 * captures the plain-language `value`.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logging';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { redactedString } from '@/lib/security/redact';
import { appendSlotValue } from '@/lib/framework/data-slots/values';
import type { AppendSlotValueInput } from '@/lib/framework/data-slots/values';
import { getSlotDefinition } from '@/lib/framework/data-slots/queries';
import { SLOT_SOURCE_TYPE } from '@/lib/framework/data-slots/vocabulary';
import { decodeScope } from '@/lib/framework/shared/scope';

const fillSlotSchema = z.object({
  /** The slot to fill — an active definition's slug (targeted) or a new one (open-mint). */
  slotSlug: z.string().min(1).max(120),
  /** The plain-language reading — canonical for conversation. */
  value: z.string().min(1),
  /** 1–10. */
  confidence: z.number().int().min(1).max(10),
  /** One sentence: how this reading was made. */
  reasoningNote: z.string().min(1),
  /** How the value was captured (classifier — X1 free string, validated to the vocab). */
  sourceType: z.enum(SLOT_SOURCE_TYPE),
});
type FillSlotArgs = z.infer<typeof fillSlotSchema>;

interface FillSlotData {
  slotSlug: string;
  version: number;
  /** Whether the slug was an open-mode mint (no prior definition). */
  minted: boolean;
}

export class FillSlotCapability extends BaseCapability<FillSlotArgs, FillSlotData> {
  readonly slug = 'fill_slot';
  readonly processesPii = true;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'fill_slot',
    description:
      'Record something newly learned about the user as a data-slot value. Use a known slot slug, or a new descriptive slug to capture something not yet tracked. Silent — the user is not shown this.',
    parameters: {
      type: 'object',
      properties: {
        slotSlug: {
          type: 'string',
          description: 'The slot to fill (e.g. "primary_goal"). A new slug captures a new fact.',
          minLength: 1,
          maxLength: 120,
        },
        value: { type: 'string', description: 'The reading, in plain language.', minLength: 1 },
        confidence: {
          type: 'integer',
          description: 'How confident this reading is, 1 (low) to 10 (high).',
          minimum: 1,
          maximum: 10,
        },
        reasoningNote: {
          type: 'string',
          description: 'One sentence: how you arrived at this reading.',
          minLength: 1,
        },
        sourceType: {
          type: 'string',
          description: 'How the value was captured.',
          enum: Object.values(SLOT_SOURCE_TYPE),
        },
      },
      required: ['slotSlug', 'value', 'confidence', 'reasoningNote', 'sourceType'],
    },
  };

  protected readonly schema = fillSlotSchema;

  /**
   * The captured `value` (+ the `reasoningNote`, which quotes it) is user-derived PII, so
   * both are masked in the durable audit row; the `slotSlug`/`confidence`/`sourceType`
   * stay so an auditor sees WHAT was written. The LLM still sees the un-redacted result.
   */
  redactProvenance(
    args: FillSlotArgs,
    result: CapabilityResult<FillSlotData>
  ): { args: unknown; resultPreview: string } {
    const safeArgs = {
      ...args,
      value: redactedString('slot-value'),
      reasoningNote: redactedString('slot-reasoning'),
    };
    return { args: safeArgs, resultPreview: JSON.stringify(result) };
  }

  async execute(
    args: FillSlotArgs,
    context: CapabilityContext
  ): Promise<CapabilityResult<FillSlotData>> {
    if (context.userId === null) {
      return this.error(
        'Slot capture is unavailable for system-initiated runs (no user context).',
        'no_user_context'
      );
    }

    // Targeted vs open-mint: a defined-and-active slug appends; a retired one is refused;
    // an undefined slug is a runtime open-mode mint.
    const definition = await getSlotDefinition(args.slotSlug);
    if (definition !== null && !definition.isActive) {
      return this.error(
        `Slot "${args.slotSlug}" is retired and no longer accepts new values.`,
        'slot_inactive'
      );
    }
    const minted = definition === null;
    if (minted) {
      logger.info('fill_slot: minting an open-mode slot value', {
        slotSlug: args.slotSlug,
        agentId: context.agentId,
      });
    }

    const scope = decodeScope(context.scope);
    const input: AppendSlotValueInput = {
      userId: context.userId,
      slotSlug: args.slotSlug,
      value: args.value,
      confidence: args.confidence,
      sourceType: args.sourceType,
      reasoningNote: args.reasoningNote,
      provenance: {
        ...(context.conversationId !== undefined ? { conversationId: context.conversationId } : {}),
        ...(scope.moduleSlug !== undefined ? { moduleSlug: scope.moduleSlug } : {}),
        ...(scope.nodeKey !== undefined ? { nodeKey: scope.nodeKey } : {}),
      },
    };

    const written = await appendWithP2002Retry(input);
    return this.success(
      { slotSlug: written.slotSlug, version: written.version, minted },
      {
        skipFollowup: true,
      }
    );
  }
}

/**
 * Append, retrying once on a P2002 unique-violation — a concurrent same-slug append that
 * computed the same next version. The re-run reads the now-committed head and takes the
 * next version. A second P2002 (vanishingly rare) propagates to the dispatcher.
 */
async function appendWithP2002Retry(input: AppendSlotValueInput) {
  try {
    return await appendSlotValue(input);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return appendSlotValue(input);
    }
    throw err;
  }
}
