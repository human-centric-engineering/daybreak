/**
 * View / wire types for the framework module admin surfaces (f-ops-views).
 *
 * The list/detail pages fetch modules over HTTP (`serverFetch` → `response.json()`),
 * so a Prisma `DateTime` column arrives as an ISO **string**, not a `Date`. Typing
 * the fetched rows as the raw `Module` Prisma model (which declares `Date`) would
 * misdescribe that at the client boundary — a latent trap for any later code that
 * calls a `Date` method on what is actually a string. These view types are the
 * honest wire shape the pages consume, mirroring the orchestration `*ListItem`
 * convention (e.g. `AiCapabilityListItem`).
 */

/** A framework module as it appears in the admin list (JSON-serialized wire shape). */
export interface ModuleListItem {
  id: string;
  slug: string;
  name: string;
  /** Free-form lifecycle status (X1): draft | active | scheduled | retired | … */
  status: string;
  /** Free-form audience (X1): all | invite | flag-gated | … */
  audience: string;
  /** false = code removed but the row is retained for audit. */
  isRegistered: boolean;
  /** ISO 8601 string (a JSON-serialized `DateTime`), not a `Date`. */
  updatedAt: string;
}
