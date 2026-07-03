/**
 * The facilitation-map JSON format — the authored snapshot shape (f-map t-1).
 *
 * A published map version stores a `definition` Json blob; this module is the
 * single Zod source of truth for that blob's shape: nodes (places + structural
 * markers), typed edges (F3 — exactly four), family-tagged conditions (F4 —
 * three families, unknown families rejected at parse), and first-class region
 * containers (F5). It is PURE and DB-free: the version service (t-2) parses a
 * draft against `mapDefinitionSchema` before publishing, and `f-engine` (later)
 * *evaluates* the conditions this module only *shapes*.
 *
 * The closed sets below are `z.enum`s validating a `Json` column's CONTENTS, not
 * Prisma enum COLUMNS — so they don't conflict with the free-form-`String`
 * schema convention (X1), which governs table columns. Closed-set validation is
 * exactly what belongs in the Zod layer.
 *
 * See `.context/framework/planning/f-map.md` (t-1) and spec §5.1 (F1–F5).
 */

import { z } from 'zod';

// ─── Closed vocabularies (F3 / F4 / F5) ──────────────────────────────────────

/** Node kinds: places (`module`), maturity markers (`stage`), one-off
 *  achievements (`milestone`), and containers (`region`, F5). */
export const NODE_TYPES = ['module', 'stage', 'milestone', 'region'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** The four edge types (F3). A closed set keeps the engine's later availability
 *  computation total and explainable. */
export const EDGE_TYPES = ['prerequisite', 'unlocks', 'tangent', 'related_to'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/** Condition families (F4). Unknown families are rejected at parse; adding a
 *  family later is an additive engine + schema change, never a migration of
 *  published, versioned maps. */
export const CONDITION_FAMILIES = ['state', 'slot', 'temporal'] as const;
export type ConditionFamily = (typeof CONDITION_FAMILIES)[number];

/** Authored completion intent: one-off places close, recurring places reopen.
 *  The runtime effect (F6) lives in journey state — here it is only recorded. */
export const COMPLETION_MODES = ['once', 'repeatable'] as const;
export type CompletionMode = (typeof COMPLETION_MODES)[number];

/** Temporal predicate kinds (F4). The three date kinds carry an `at` instant;
 *  the cooldown kind carries `durationHours`. */
export const TEMPORAL_KINDS = [
  'available_after',
  'available_until',
  'recommended_by',
  'cooldown_since_last_visit',
] as const;
export type TemporalKind = (typeof TEMPORAL_KINDS)[number];

const TEMPORAL_AT_KINDS: readonly TemporalKind[] = [
  'available_after',
  'available_until',
  'recommended_by',
];

// ─── Conditions (F4) — declarative gates the engine evaluates ────────────────

/** State predicate: e.g. "milestone M reached". */
export const stateConditionSchema = z.object({
  family: z.literal('state'),
  /** Node key of the milestone/place this gate depends on. */
  milestone: z.string().min(1),
  /** Whether that node must be reached (default) or deliberately not-yet-reached. */
  reached: z.boolean().default(true),
});

/** Slot predicate: e.g. "slot X ≥ value, at confidence ≥ N". Reads the typed
 *  `valueJson` form of a slot (§6.1), never parses prose. */
export const slotConditionSchema = z.object({
  family: z.literal('slot'),
  slug: z.string().min(1),
  op: z.enum(['gte', 'lte', 'eq']),
  value: z.union([z.number(), z.string(), z.boolean()]),
  minConfidence: z.number().int().min(1).max(10).optional(),
});

/** Temporal predicate (F4): date-anchored gates + a per-node cooldown. Makes the
 *  engine time-aware with no scheduler — it takes `now` as an input. The date
 *  kinds require `at`; the cooldown kind requires `durationHours`. */
export const temporalConditionSchema = z
  .object({
    family: z.literal('temporal'),
    kind: z.enum(TEMPORAL_KINDS),
    /** ISO-8601 instant for the three date kinds. */
    at: z.string().datetime().optional(),
    /** Hours since the last visit for `cooldown_since_last_visit`. */
    durationHours: z.number().positive().optional(),
  })
  .superRefine((cond, ctx) => {
    if (TEMPORAL_AT_KINDS.includes(cond.kind)) {
      if (cond.at === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['at'],
          message: `Temporal condition "${cond.kind}" requires an ISO-8601 "at".`,
        });
      }
    } else if (cond.durationHours === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationHours'],
        message: 'Temporal condition "cooldown_since_last_visit" requires "durationHours".',
      });
    }
  });

/** A gate on an edge, tagged by family. The discriminated union rejects any
 *  UNKNOWN family at parse time — that rejection *is* F4's forward-compat guard. */
export const conditionSchema = z.discriminatedUnion('family', [
  stateConditionSchema,
  slotConditionSchema,
  temporalConditionSchema,
]);

// ─── Nodes & edges ───────────────────────────────────────────────────────────

/** One-time "airport" arrival behaviour: a welcome workflow and/or agent. Shape
 *  kept intentionally minimal — the wiring is a later feature's concern. */
export const onFirstArrivalSchema = z.object({
  workflowSlug: z.string().min(1).optional(),
  agentSlug: z.string().min(1).optional(),
});

/** Arbitrary authored metadata bag, opaque to the engine. */
const metaSchema = z.record(z.string(), z.unknown());

export const nodeSchema = z
  .object({
    /** Stable key referenced by user journey state (F2) — never a row id. */
    key: z.string().min(1),
    type: z.enum(NODE_TYPES),
    /** Required iff `type === 'module'` — binds the node to a registered Module. */
    moduleSlug: z.string().min(1).optional(),
    /** Maturity level this node belongs to. */
    stage: z.string().min(1).optional(),
    /** Key of the containing region node (F5). */
    region: z.string().min(1).optional(),
    completionMode: z.enum(COMPLETION_MODES).default('once'),
    onFirstArrival: onFirstArrivalSchema.optional(),
    meta: metaSchema.optional(),
  })
  .superRefine((node, ctx) => {
    // Per-node shape rule (Zod's job); cross-node references are validate.ts's.
    if (node.type === 'module' && node.moduleSlug === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['moduleSlug'],
        message: 'A node of type "module" must declare a moduleSlug.',
      });
    }
  });

export const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(EDGE_TYPES),
  condition: conditionSchema.optional(),
  meta: metaSchema.optional(),
});

/** The full authored snapshot stored as `FacilitationGraphVersion.definition`. */
export const mapDefinitionSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type MapCondition = z.infer<typeof conditionSchema>;
export type MapNode = z.infer<typeof nodeSchema>;
export type MapEdge = z.infer<typeof edgeSchema>;
export type MapDefinition = z.infer<typeof mapDefinitionSchema>;
