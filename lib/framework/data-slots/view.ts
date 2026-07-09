/**
 * Data-slots admin-view wire types (f-admin-surfaces t-1).
 *
 * The JSON-serialised shapes the slot admin surfaces return — the honest
 * over-the-wire form of the `SlotDefinition` / `SlotValue` rows. **Dates are ISO
 * `string`s, not `Date`** (a fetched row is JSON), the convention `f-ops-views`
 * established in its `modules/view.ts` / `journey/view.ts`: typing them as the raw
 * Prisma models would be a type-lie the client can't honour.
 *
 * Kept in a view module (not a query module) so the client wire contract is one
 * importable place, free of Prisma types (and of the framework `queries` the X6
 * boundary keeps out of `app/api` route tests).
 */

/**
 * A slot definition in wire form — every authored column, `createdAt`/`updatedAt`
 * as ISO strings. Consumed by the definitions browser (t-1). Mirrors the raw
 * `SlotDefinition` row the shipped `GET /slot-definitions` endpoint serialises.
 */
export interface SlotDefinitionView {
  id: string;
  slug: string;
  group: string;
  description: string;
  scope: string;
  visibility: string;
  mode: string;
  dataType: string;
  sensitivity: string;
  priorityWeight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A current slot-value head in wire form — one row of the values browser (t-1).
 *
 * `value`/`valueJson` are the **read-masked** form: for a slot whose definition is
 * `sensitive` / `special_category` the browser masks them by default (`masked:
 * true`, `value` → a redaction sentinel, `valueJson` → `null`) and only returns the
 * stored form when the caller passes `reveal=true` (an audited operator action).
 * `standard` slots and unknown (open-minted) slugs are never masked. `sensitivity`
 * is stitched from the definition so the UI can label the row and decide whether to
 * offer a reveal affordance; an open-minted slug with no definition reports
 * `standard`.
 */
export interface SlotValueHeadView {
  id: string;
  /** The value's owner. Shown raw (a cuid), matching the journey explorer's picker. */
  userId: string;
  slotSlug: string;
  version: number;
  /** Plain-language reading — masked to a sentinel when `masked` is true. */
  value: string;
  /** Typed form — `null` when the row is masked (never leak a sensitive typed value). */
  valueJson: unknown;
  confidence: number;
  sourceType: string;
  /** The definition's sensitivity, or `standard` for an open-minted slug with no definition. */
  sensitivity: string;
  /** True when `value`/`valueJson` were masked in this response (a reveal was not requested). */
  masked: boolean;
  capturedAt: string;
}
