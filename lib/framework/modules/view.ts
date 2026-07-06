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

import type { FieldDescriptor } from '@/lib/framework/modules/config/schema-descriptors';

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

/**
 * The config-form payload (`GET /modules/[slug]/config`) as the client consumes it —
 * the server `ModuleConfigForm` with its `Prisma.JsonValue` values narrowed to a plain
 * object (a module's config is always a JSON object; the `{}` default holds for a fresh
 * or unregistered module).
 */
export interface ModuleConfigFormView {
  /** Whether the module's code is still registered (its schema is available to render). */
  registered: boolean;
  /** Field descriptors for the generic form; `[]` when the module is unregistered. */
  descriptors: FieldDescriptor[];
  /** The module's current stored config values. */
  values: Record<string, unknown>;
}

/**
 * One immutable config version as the client consumes it — the wire shape of a
 * `ModuleVersion` row (ISO-string `createdAt`), minus the `snapshot` blob the list view
 * doesn't render. The newest version is always the live config (no draft/published split).
 */
export interface ModuleVersionSummary {
  id: string;
  version: number;
  changeSummary: string | null;
  /** The admin user id that wrote this version, or null if since erased. */
  createdBy: string | null;
  /** ISO 8601 string (a JSON-serialized `DateTime`). */
  createdAt: string;
}

/** The `GET /modules/[slug]/versions` payload as the client consumes it. */
export interface ModuleVersionsView {
  versions: ModuleVersionSummary[];
  nextCursor: string | null;
}
