/**
 * Structure-change proposal admin-view wire type (f-admin-surfaces t-3).
 *
 * The JSON-serialised shape the proposal review surface reads — the honest over-the-wire
 * form of a `StructureChangeProposal` row that the shipped
 * `GET /facilitation/proposals` (+ `…/[id]`) endpoints return. **Dates are ISO `string`s,
 * not `Date`** (a fetched row is JSON) — the same convention `f-ops-views` established in
 * `modules/view.ts` and `f-admin-surfaces` continued in `data-slots/view.ts` (t-1) and
 * `policies/view.ts` (t-2): typing them as the raw Prisma model would be a type-lie the
 * client can't honour.
 *
 * `proposedDefinition` stays `unknown` — it is the full proposed map definition
 * (whole-snapshot), whose real validator is the map publish gate run server-side on
 * approve. The review UI renders it as a structured/JSON view (decision D — no visual
 * map-diff in v1.1), never re-validating it.
 *
 * Kept in a view module (not the service module) so the client wire contract is one
 * importable place, free of Prisma types.
 */

/** The proposal lifecycle statuses, in queue order. CHECK-constrained in the schema. */
export const PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'published'] as const;

/** A proposal status; an unknown stored status (forward-compat DB row) is still a string. */
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * A structure-change proposal in wire form — every column, `createdAt`/`updatedAt` as ISO
 * strings and `proposedDefinition` as opaque JSON. Consumed by the proposal queue + review.
 * `status` is typed to the framework vocabulary for the queue's status tabs; a forward-compat
 * DB row is still a plain string at runtime, so consumers read it defensively.
 */
export interface StructureChangeProposalView {
  id: string;
  /** The proposal subject — `'map'` | `'module_config'` | `'policy'` (f-governance-plus t-1). */
  subjectType: string;
  /** The target — a map/graph slug, a module slug, or a policy kind. */
  subjectId: string;
  /** The version the diff was made against (map/module_config conflict detection); null for policy. */
  baseVersion: number | null;
  /** The proposed content (map definition / config value / policy payload) — validated server-side. */
  proposedDefinition: unknown;
  /** pending | approved | rejected | published. */
  status: ProposalStatus;
  /** Risk classification; the auto-approve taxonomy is deferred (§9.2). */
  riskClass: string;
  /** The author — `"agent:<slug>"` or a user id (no `User` FK, X6). */
  createdBy: string;
  /** The approving/rejecting admin's user id, or `null` after erasure (ON DELETE SET NULL). */
  reviewedBy: string | null;
  /** The reason captured on rejection; `null` otherwise. */
  rejectionReason: string | null;
  /** The `FacilitationGraphVersion.id` created on publish; `null` until published. */
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}
