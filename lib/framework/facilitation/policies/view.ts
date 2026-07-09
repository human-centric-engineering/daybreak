/**
 * Facilitation policy admin-view wire type (f-admin-surfaces t-2).
 *
 * The JSON-serialised shape the policy admin surface reads — the honest
 * over-the-wire form of a `FacilitationPolicy` row that the shipped
 * `GET /facilitation/policies` endpoint returns. **Dates are ISO `string`s, not
 * `Date`** (a fetched row is JSON), the convention `f-ops-views` established in its
 * `modules/view.ts` and `f-admin-surfaces` t-1 continued in `data-slots/view.ts`:
 * typing them as the raw Prisma model would be a type-lie the client can't honour.
 *
 * `payload` stays `unknown` — its concrete shape is the kind's discriminated-union
 * member (`facilitationPolicySchema`), which the client never re-validates (the
 * server `assertValidFacilitationPolicy` is the trust boundary). The kind-fields form
 * hydrates its controls from `payload` defensively.
 *
 * Kept in a view module (not the query module) so the client wire contract is one
 * importable place, free of Prisma types.
 */

import type { FacilitationPolicyKind } from '@/lib/framework/facilitation/policies/kinds';

/**
 * A facilitation policy in wire form — every column, `createdAt`/`updatedAt` as ISO
 * strings and `payload` as opaque JSON. Consumed by the policy admin table + form.
 * `kind` is typed to the framework vocabulary for the switch in the kind-fields form;
 * an unknown stored kind (a forward-compat DB row) is still a plain string at runtime.
 */
export interface FacilitationPolicyView {
  id: string;
  kind: FacilitationPolicyKind;
  enabled: boolean;
  /** The kind's payload — validated server-side, opaque here. */
  payload: unknown;
  /** The authoring admin's user id, or `null` after erasure (ON DELETE SET NULL). */
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
