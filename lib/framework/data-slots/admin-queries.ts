/**
 * Slot admin-surface reads (f-admin-surfaces t-1).
 *
 * The values browser's one enriched read, kept OUT of `values.ts` so that module
 * stays the pure per-user engine (`getSlotHeads(userId)` is the guidance hot path,
 * keyed on a single user). The admin surface needs the *cross-user* shape — the
 * current head of a slot across every user, or every head of one user — which
 * `getSlotHeads` deliberately does not offer, so this composes a direct
 * `supersededAt IS NULL` query with the filters and pagination the admin console
 * needs, then stitches each row's **sensitivity** from its definition and applies
 * read-masking. This mirrors `facilitation/journey/admin-queries.ts`: enrichment +
 * shaping live here; the primitive layer stays pure.
 *
 * **Read-masking (f-admin-surfaces decision B).** `SlotValue` is per-user personal
 * data. A `special_category` value is already a redaction sentinel *at rest* (the
 * capture layer masks-before-storage); a `sensitive` value is stored in the clear.
 * So an admin read masks BOTH by default — a definition graded `sensitive` or
 * `special_category` yields `masked: true`, `value` → a sentinel, `valueJson` →
 * `null` — and only returns the stored form when `reveal` is set (an audited action
 * the route logs). `standard` slots, and open-minted slugs with no definition, are
 * never masked. Revealing a `special_category` row still shows only the stored
 * sentinel, because nothing else was ever persisted — honest, not a leak.
 */

import { prisma } from '@/lib/db/client';
import { redactedString } from '@/lib/security/redact';
import { SLOT_SENSITIVITY } from '@/lib/framework/data-slots/vocabulary';
import type { SlotValueHeadView } from '@/lib/framework/data-slots/view';

/** Already-validated inputs for {@link listSlotValueHeadsForAdmin} (1-based page). */
export interface ListSlotValuesParams {
  page: number;
  limit: number;
  slotSlug?: string;
  userId?: string;
  /** When true, return the stored form instead of the masked sentinel (audited by the route). */
  reveal: boolean;
}

/** Whether a definition's sensitivity grade means a value is masked on an unrevealed read. */
function isMaskedSensitivity(sensitivity: string): boolean {
  return (
    sensitivity === SLOT_SENSITIVITY.sensitive || sensitivity === SLOT_SENSITIVITY.special_category
  );
}

/**
 * A page of current slot-value heads (`supersededAt IS NULL`) for the admin browser,
 * newest-captured first, optionally narrowed to one `slotSlug` and/or one `userId`.
 * Each row's `sensitivity` is stitched from its definition with one batched lookup
 * over the page's distinct slugs (no N+1), and `value`/`valueJson` are read-masked
 * per that grade unless `reveal` is set. The `capturedAt`/`slotSlug` sort matches the
 * engine's own head ordering so paging is stable.
 */
export async function listSlotValueHeadsForAdmin(
  params: ListSlotValuesParams
): Promise<{ items: SlotValueHeadView[]; total: number }> {
  const { page, limit, slotSlug, userId, reveal } = params;

  const where = {
    supersededAt: null,
    ...(slotSlug ? { slotSlug } : {}),
    ...(userId ? { userId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.slotValue.findMany({
      where,
      orderBy: [{ capturedAt: 'desc' }, { slotSlug: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.slotValue.count({ where }),
  ]);

  if (rows.length === 0) return { items: [], total };

  const slugs = [...new Set(rows.map((r) => r.slotSlug))];
  const definitions = await prisma.slotDefinition.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, sensitivity: true },
  });
  // Open-minted slugs have no definition → treated as `standard` (never masked).
  const sensitivityBySlug = new Map(definitions.map((d) => [d.slug, d.sensitivity]));

  const items: SlotValueHeadView[] = rows.map((r) => {
    const sensitivity = sensitivityBySlug.get(r.slotSlug) ?? SLOT_SENSITIVITY.standard;
    const masked = !reveal && isMaskedSensitivity(sensitivity);
    return {
      id: r.id,
      userId: r.userId,
      slotSlug: r.slotSlug,
      version: r.version,
      value: masked ? redactedString(sensitivity) : r.value,
      valueJson: masked ? null : (r.valueJson ?? null),
      confidence: r.confidence,
      sourceType: r.sourceType,
      sensitivity,
      masked,
      capturedAt: r.capturedAt.toISOString(),
    };
  });

  return { items, total };
}
