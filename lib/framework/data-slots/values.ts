/**
 * Slot-value engine — the insert-only read/write path over `framework_slot_value`
 * (spec §6.1, decisions D1/D4).
 *
 * A slot value is **never updated in place and never deleted** (except GDPR
 * erasure via the FK cascade). Learning something new about a user is a *new
 * version*; the previous head is stamped `supersededAt`. The current picture of a
 * user is therefore "every row `WHERE supersededAt IS NULL`" — one indexed filter,
 * not a `max(version)` scan per slug (D4).
 *
 * This is the mechanical engine only. The `fill_slot` / `get_state` **capabilities**
 * that call it — with PII redaction, sensitivity-driven masking, open-mode slug
 * minting, structured-output extraction, and per-grant exposure — are
 * `f-slot-capture` (feature 10). Access scoping (`canRead`) is `f-journey-state`.
 */

import type { Prisma, SlotValue } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import type { SlotSourceType } from '@/lib/framework/data-slots/vocabulary';

/**
 * Per-version provenance (stored in `SlotValue.provenance`). `conversationId` links
 * a reading back to the `AiConversation` archive so "follow the link to the original
 * exchange" is a join, not new storage (spec §6.1). All fields optional — the engine
 * stores what the caller supplies; the capture layer decides what to populate.
 */
export interface SlotValueProvenance {
  conversationId?: string;
  messageRange?: string;
  moduleSlug?: string;
  nodeKey?: string;
  capturedAt?: string;
  contextExcerptRef?: string;
}

/** The caller-supplied fields of a new slot value. `version`/`supersededAt`/`capturedAt` are engine-managed. */
export interface AppendSlotValueInput {
  userId: string;
  /** Definition slug, or a minted slug (open mode) — not validated here (that is `fill_slot`'s job). */
  slotSlug: string;
  /** Plain-language reading — canonical for conversation. */
  value: string;
  /** Optional typed form per the definition's `dataType` — canonical for gates & analytics. Omitted ⇒ column stays NULL. */
  valueJson?: Prisma.InputJsonValue;
  /** 1–10. */
  confidence: number;
  sourceType: SlotSourceType;
  /** One sentence: how this reading was made. */
  reasoningNote: string;
  provenance: SlotValueProvenance;
}

/** Narrowing options for {@link getSlotHeads}. */
export interface GetSlotHeadsOptions {
  /** Restrict to these slot slugs' heads. Omitted ⇒ all of the user's heads. */
  slotSlugs?: string[];
}

/**
 * Append a new version of a slot value, insert-only. In one transaction: find the
 * current head (`supersededAt IS NULL`) for `(userId, slotSlug)`, compute the next
 * version (monotonic per slug, from 1), stamp the outgoing head's `supersededAt`,
 * and insert the new row. Value rows are never mutated except that single
 * `supersededAt` stamp, and never deleted.
 *
 * A single `now` is used for both the supersede stamp and the new row's `capturedAt`
 * so they agree. Concurrency backstop: `@@unique([userId, slotSlug, version])` — two
 * racing appends for the same slug compute the same version and the second fails on
 * the unique constraint (the caller retries), so two live heads can't result.
 */
export async function appendSlotValue(input: AppendSlotValueInput): Promise<SlotValue> {
  const now = new Date();

  return executeTransaction(async (tx) => {
    const head = await tx.slotValue.findFirst({
      where: { userId: input.userId, slotSlug: input.slotSlug, supersededAt: null },
      orderBy: { version: 'desc' },
    });

    const version = head ? head.version + 1 : 1;

    if (head) {
      await tx.slotValue.update({ where: { id: head.id }, data: { supersededAt: now } });
    }

    return tx.slotValue.create({
      data: {
        userId: input.userId,
        slotSlug: input.slotSlug,
        version,
        value: input.value,
        // Omit `valueJson` when unset so the nullable column stays NULL (vs JSON null).
        ...(input.valueJson !== undefined ? { valueJson: input.valueJson } : {}),
        confidence: input.confidence,
        sourceType: input.sourceType,
        reasoningNote: input.reasoningNote,
        // Typed provenance → Json column (house pattern for internal typed writes).
        provenance: input.provenance as Prisma.InputJsonValue,
        capturedAt: now,
      },
    });
  });
}

/**
 * Read a user's current slot values — the head version of each slug
 * (`supersededAt IS NULL`), most-recently-captured first. The guidance hot path,
 * served by `@@index([userId, capturedAt])`.
 *
 * Narrowing is by `slotSlug` (a column this table has). Scope/group narrowing —
 * which needs a join to `SlotDefinition` — belongs to the guidance layer that owns
 * that query (`f-guidance`); it is intentionally not built into this raw engine.
 * Access scoping (`canRead`) wraps this later (`f-journey-state`); the `userId`
 * argument is the seam that predicate supplies.
 */
export async function getSlotHeads(
  userId: string,
  options?: GetSlotHeadsOptions
): Promise<SlotValue[]> {
  return prisma.slotValue.findMany({
    where: {
      userId,
      supersededAt: null,
      ...(options?.slotSlugs ? { slotSlug: { in: options.slotSlugs } } : {}),
    },
    orderBy: { capturedAt: 'desc' },
  });
}
