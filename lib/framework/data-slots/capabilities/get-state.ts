/**
 * `get_state` capability (f-slot-capture t-1) — an agent reads what is currently known
 * about the user: the head value of each of their data-slots (spec §6). A silent tool
 * (D5) the agent calls mid-conversation to personalise its response.
 *
 * Mirrors `built-in/user-memory.ts`'s `ReadUserMemoryCapability` (a `processesPii`,
 * `context.userId`-scoped read) over the slot engine instead of `AiUserMemory`.
 *
 * **X2 — every slot read routes through `canRead`.** `getSlotHeads` takes a bare
 * `userId` and is deliberately *not* `canRead`-wrapped ([`access.ts`] /
 * [`values.ts`] both document this) — this capability supplies the guard: it builds a
 * `JourneyViewer` from the session user and calls `canRead(viewer, subject, scope)`
 * before reading. Today `subject === context.userId` (own slots) → allow; the seam
 * composes with Sunrise #366/#367 for §8 cohort-facilitator reads later. A denied read
 * returns an **empty** result (a capability returns a structured result, never throws
 * across the boundary), so it can never surface another user's heads.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { redactedString } from '@/lib/security/redact';
import { getSlotHeads } from '@/lib/framework/data-slots/values';
import { canRead, type JourneyViewer } from '@/lib/framework/shared/access';

const getStateSchema = z.object({
  /** Narrow to these slot slugs' heads. Omit ⇒ all of the user's current slot values. */
  slotSlugs: z.array(z.string().min(1)).optional(),
});
type GetStateArgs = z.infer<typeof getStateSchema>;

/** One slot's current reading, as returned to the agent. */
interface SlotView {
  slug: string;
  value: string;
  confidence: number;
  capturedAt: string;
}
interface GetStateData {
  slots: SlotView[];
}

export class GetStateCapability extends BaseCapability<GetStateArgs, GetStateData> {
  readonly slug = 'get_state';
  readonly processesPii = true;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_state',
    description:
      'Read what is currently known about the user — the current value of each of their captured data-slots. Omit slotSlugs to read everything, or pass specific slugs to narrow.',
    parameters: {
      type: 'object',
      properties: {
        slotSlugs: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description:
            "Optional list of slot slugs to read. Omit to read all of the user's current slot values.",
        },
      },
      required: [],
    },
  };

  protected readonly schema = getStateSchema;

  /**
   * Slot `value`s are exactly the user-derived free text this reads, so each is masked
   * in the durable audit row; the `slug` + `confidence` stay so an auditor can see WHAT
   * was read (mirroring `user-memory.ts`). The LLM still receives the un-redacted result.
   */
  redactProvenance(
    args: GetStateArgs,
    result: CapabilityResult<GetStateData>
  ): { args: unknown; resultPreview: string } {
    if (result.success && result.data) {
      const safe = {
        slots: result.data.slots.map((s) => ({
          slug: s.slug,
          value: redactedString('slot-value'),
          confidence: s.confidence,
          capturedAt: s.capturedAt,
        })),
      };
      return { args, resultPreview: JSON.stringify({ success: true, data: safe }) };
    }
    return { args, resultPreview: JSON.stringify(result) };
  }

  async execute(
    args: GetStateArgs,
    context: CapabilityContext
  ): Promise<CapabilityResult<GetStateData>> {
    if (context.userId === null) {
      return this.error(
        'Slot state is unavailable for system-initiated runs (no user context).',
        'no_user_context'
      );
    }
    const subject = context.userId;
    const viewer: JourneyViewer = { userId: context.userId };

    // X2 guard before the (unguarded-by-design) engine read. Denied ⇒ empty, no read.
    if (!(await canRead(viewer, subject))) {
      return this.success({ slots: [] });
    }

    const heads = await getSlotHeads(
      subject,
      args.slotSlugs !== undefined && args.slotSlugs.length > 0
        ? { slotSlugs: args.slotSlugs }
        : undefined
    );

    return this.success({
      slots: heads.map((h) => ({
        slug: h.slotSlug,
        value: h.value,
        confidence: h.confidence,
        capturedAt: h.capturedAt.toISOString(),
      })),
    });
  }
}
