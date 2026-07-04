/**
 * Facilitation map version service (f-map t-2) — the only module that writes
 * `FacilitationGraphVersion` rows or flips `FacilitationGraph.publishedVersionId`.
 *
 * A direct adaptation of `lib/orchestration/workflows/version-service.ts` to the
 * map models. Differences that matter:
 *   - Graphs are identified by their stable `slug` (F19 / what journeys key on),
 *     not an opaque id, so the admin routes (`/maps/[slug]`) resolve nothing.
 *   - Publish/rollback gate on `validatePublishableMap` — the composable
 *     format-validation chain `f-engine` extends with graph-invariant checks
 *     (cycles / reachability); see f-map.md decision 3 and validate.ts.
 *
 * All mutating functions run inside a `$transaction` when they write more than one
 * row, and emit a `logAdminAction` audit entry. See spec §5.1 and §7.
 */

import { Prisma } from '@prisma/client';
import type { FacilitationGraph, FacilitationGraphVersion } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { mapDefinitionSchema } from '@/lib/framework/facilitation/map/schema';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import { validateMapFormat } from '@/lib/framework/facilitation/map/validate';

type Tx = Prisma.TransactionClient;

const ENTITY_TYPE = 'facilitation_graph';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * The publish-time validation chain: Zod shape → within-snapshot referential
 * integrity. Throws `ValidationError` with field-keyed messages on the first
 * failing stage. **This is the seam `f-engine` extends** — it appends a
 * graph-invariant stage (prerequisite cycles, unreachable-required) after the
 * format checks. Kept synchronous while every stage is pure; when f-engine adds a
 * stage that needs I/O (e.g. confirming a referenced module exists) this becomes
 * `async` and the three internal callers below gain an `await`. That ripple stays
 * internal: the public service API (`createGraph` / `publishDraft` / `rollback`,
 * all already async) is unchanged — the stability the routes and f-engine rely on.
 */
export function validatePublishableMap(definition: unknown): MapDefinition {
  const parsed = mapDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    throw new ValidationError('Map definition is malformed', {
      definition: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  const format = validateMapFormat(parsed.data);
  if (!format.ok) {
    throw new ValidationError('Map definition has referential errors', {
      definition: format.errors.map((e) => e.message),
    });
  }
  return parsed.data;
}

interface ResolvedGraph {
  id: string;
  name: string;
  publishedVersionId: string | null;
}

async function loadGraph(slug: string): Promise<ResolvedGraph> {
  const graph = await prisma.facilitationGraph.findUnique({
    where: { slug },
    select: { id: true, name: true, publishedVersionId: true },
  });
  if (!graph) throw new NotFoundError(`Facilitation map "${slug}" not found`);
  return graph;
}

async function nextVersionNumber(client: Tx, graphId: string): Promise<number> {
  const row = await client.facilitationGraphVersion.findFirst({
    where: { graphId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (row?.version ?? 0) + 1;
}

async function getVersionInt(versionId: string | null): Promise<number | null> {
  if (!versionId) return null;
  const row = await prisma.facilitationGraphVersion.findUnique({
    where: { id: versionId },
    select: { version: true },
  });
  return row?.version ?? null;
}

/** Write v1 for a freshly-created graph and pin it, inside the caller's tx. */
async function createInitialVersion(
  tx: Tx,
  graphId: string,
  definition: MapDefinition,
  userId: string
): Promise<FacilitationGraphVersion> {
  const version = await tx.facilitationGraphVersion.create({
    data: {
      graphId,
      version: 1,
      definition: definition as unknown as Prisma.InputJsonValue,
      changeSummary: 'Initial version',
      createdBy: userId,
    },
  });
  await tx.facilitationGraph.update({
    where: { id: graphId },
    data: { publishedVersionId: version.id },
  });
  return version;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CreateGraphArgs {
  slug: string;
  name: string;
  description?: string | null;
  /** Optional initial map. When given, it is validated and published as v1. */
  definition?: MapDefinition;
  userId: string;
  clientIp?: string | null;
}

/**
 * Create a facilitation map. With no `definition` the map starts empty (no
 * versions, no draft) ready to be drafted; with one, it is validated and
 * published as v1 atomically. A duplicate slug is a `ValidationError`, not a raw
 * Prisma constraint error.
 */
export async function createGraph(args: CreateGraphArgs): Promise<FacilitationGraph> {
  const { slug, name, description, definition, userId, clientIp } = args;

  const validated = definition ? validatePublishableMap(definition) : null;

  let graph: FacilitationGraph;
  try {
    graph = await prisma.$transaction(async (tx) => {
      const created = await tx.facilitationGraph.create({
        data: { slug, name, description: description ?? null, createdBy: userId },
      });
      if (!validated) return created; // empty map: no version pinned, no re-read needed
      await createInitialVersion(tx, created.id, validated, userId);
      // Re-read so the returned row reflects the pinned publishedVersionId.
      return tx.facilitationGraph.findUniqueOrThrow({ where: { id: created.id } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ValidationError('A facilitation map with this slug already exists', {
        slug: [`"${slug}" is already in use`],
      });
    }
    throw err;
  }

  logAdminAction({
    userId,
    action: 'facilitation_graph.create',
    entityType: ENTITY_TYPE,
    entityId: graph.id,
    entityName: name,
    // Created with an initial map ⇒ v1 is published: record the transition the
    // same way publish/rollback do, so audit tooling keying on
    // `changes.publishedVersion` sees every map's first publication.
    changes: validated ? { publishedVersion: { from: null, to: 1 } } : undefined,
    metadata: { slug, publishedAtCreate: validated !== null },
    clientIp: clientIp ?? null,
  });

  return graph;
}

export interface SaveDraftArgs {
  slug: string;
  definition: MapDefinition;
  userId: string;
  clientIp?: string | null;
}

/**
 * Write `draftDefinition`. Intentionally does NOT run publish validation, so an
 * author can save a half-built map and return to it (mirrors workflow `saveDraft`).
 */
export async function saveDraft(args: SaveDraftArgs): Promise<FacilitationGraph> {
  const { slug, definition, userId, clientIp } = args;
  const graph = await loadGraph(slug);

  const updated = await prisma.facilitationGraph.update({
    where: { id: graph.id },
    data: { draftDefinition: definition as unknown as Prisma.InputJsonValue },
  });

  logAdminAction({
    userId,
    action: 'facilitation_graph.draft.save',
    entityType: ENTITY_TYPE,
    entityId: graph.id,
    entityName: graph.name,
    metadata: { hasDraft: true },
    clientIp: clientIp ?? null,
  });

  return updated;
}

export interface DiscardDraftArgs {
  slug: string;
  userId: string;
  clientIp?: string | null;
}

/** Clear the in-progress draft. Still audits when there was no draft. */
export async function discardDraft(args: DiscardDraftArgs): Promise<FacilitationGraph> {
  const { slug, userId, clientIp } = args;
  const graph = await loadGraph(slug);

  const updated = await prisma.facilitationGraph.update({
    where: { id: graph.id },
    data: { draftDefinition: Prisma.DbNull },
  });

  logAdminAction({
    userId,
    action: 'facilitation_graph.draft.discard',
    entityType: ENTITY_TYPE,
    entityId: graph.id,
    entityName: graph.name,
    clientIp: clientIp ?? null,
  });

  return updated;
}

export interface PublishDraftArgs {
  slug: string;
  userId: string;
  changeSummary?: string;
  clientIp?: string | null;
}

export interface PublishResult {
  graph: FacilitationGraph;
  version: FacilitationGraphVersion;
}

/**
 * Promote `draftDefinition` to a new immutable version and pin it. Atomic:
 * validation first (the `validatePublishableMap` chain), then insert + pin +
 * clear-draft in one transaction. Throws `ValidationError` when there is no draft
 * or the draft fails validation.
 */
export async function publishDraft(args: PublishDraftArgs): Promise<PublishResult> {
  const { slug, userId, changeSummary, clientIp } = args;

  const existing = await prisma.facilitationGraph.findUnique({
    where: { slug },
    select: { id: true, name: true, draftDefinition: true, publishedVersionId: true },
  });
  if (!existing) throw new NotFoundError(`Facilitation map "${slug}" not found`);
  if (existing.draftDefinition === null || existing.draftDefinition === undefined) {
    throw new ValidationError('No draft to publish', {
      draftDefinition: ['Map has no draft to publish'],
    });
  }

  const definition = validatePublishableMap(existing.draftDefinition);
  const previousVersionInt = await getVersionInt(existing.publishedVersionId);

  const result = await prisma.$transaction(async (tx) => {
    const next = await nextVersionNumber(tx, existing.id);
    const version = await tx.facilitationGraphVersion.create({
      data: {
        graphId: existing.id,
        version: next,
        definition: definition as unknown as Prisma.InputJsonValue,
        changeSummary: changeSummary ?? null,
        createdBy: userId,
      },
    });
    const graph = await tx.facilitationGraph.update({
      where: { id: existing.id },
      data: { publishedVersionId: version.id, draftDefinition: Prisma.DbNull },
    });
    return { graph, version };
  });

  logAdminAction({
    userId,
    action: 'facilitation_graph.publish',
    entityType: ENTITY_TYPE,
    entityId: existing.id,
    entityName: existing.name,
    changes: { publishedVersion: { from: previousVersionInt, to: result.version.version } },
    metadata: changeSummary ? { changeSummary } : null,
    clientIp: clientIp ?? null,
  });

  return result;
}

export interface RollbackArgs {
  slug: string;
  /** Version NUMBER to roll back to (not a row id). */
  targetVersion: number;
  userId: string;
  changeSummary?: string;
  clientIp?: string | null;
}

/**
 * Roll back to a prior version by creating a NEW version whose snapshot copies the
 * target — history is never rewritten. The target is re-validated before writing,
 * in case a later feature (e.g. module deletion) has invalidated it.
 */
export async function rollback(args: RollbackArgs): Promise<PublishResult> {
  const { slug, targetVersion, userId, changeSummary, clientIp } = args;
  const graph = await loadGraph(slug);

  const target = await prisma.facilitationGraphVersion.findUnique({
    where: { graphId_version: { graphId: graph.id, version: targetVersion } },
  });
  if (!target) {
    throw new NotFoundError(`Facilitation map "${slug}" has no version ${targetVersion}`);
  }

  const definition = validatePublishableMap(target.definition);
  const previousVersionInt = await getVersionInt(graph.publishedVersionId);

  const result = await prisma.$transaction(async (tx) => {
    const next = await nextVersionNumber(tx, graph.id);
    const version = await tx.facilitationGraphVersion.create({
      data: {
        graphId: graph.id,
        version: next,
        definition: definition as unknown as Prisma.InputJsonValue,
        changeSummary: changeSummary ?? `Rollback to v${target.version}`,
        createdBy: userId,
      },
    });
    const updated = await tx.facilitationGraph.update({
      where: { id: graph.id },
      data: { publishedVersionId: version.id },
    });
    return { graph: updated, version };
  });

  logAdminAction({
    userId,
    action: 'facilitation_graph.rollback',
    entityType: ENTITY_TYPE,
    entityId: graph.id,
    entityName: graph.name,
    changes: { publishedVersion: { from: previousVersionInt, to: result.version.version } },
    metadata: { rolledBackToVersion: target.version },
    clientIp: clientIp ?? null,
  });

  return result;
}

export interface PublishedMap {
  slug: string;
  version: number;
  definition: MapDefinition;
}

/**
 * The published map for a slug, parsed into a typed `MapDefinition` — the read
 * `f-engine`'s `GraphStore.getPublishedGraph` builds on (the engine adds
 * traversal; this is fetch + parse). Returns `null` when the map does not exist
 * or has no published version yet. Parsing the stored blob also converts Json →
 * typed and would surface a corrupted row rather than hand back a malformed map.
 */
export async function getPublishedMap(slug: string): Promise<PublishedMap | null> {
  const graph = await prisma.facilitationGraph.findUnique({
    where: { slug },
    include: { publishedVersion: true },
  });
  if (!graph || !graph.publishedVersion) return null;
  return {
    slug: graph.slug,
    version: graph.publishedVersion.version,
    definition: mapDefinitionSchema.parse(graph.publishedVersion.definition),
  };
}

export interface ListVersionsOptions {
  limit?: number;
  cursor?: string;
}

export interface ListVersionsResult {
  versions: FacilitationGraphVersion[];
  nextCursor: string | null;
}

/**
 * Paginated version list, newest first. `cursor` is the id of the last version on
 * the previous page (versions are immutable, so an id cursor is stable).
 */
export async function listVersions(
  slug: string,
  opts: ListVersionsOptions = {}
): Promise<ListVersionsResult> {
  const graph = await loadGraph(slug);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const versions = await prisma.facilitationGraphVersion.findMany({
    where: { graphId: graph.id },
    orderBy: { version: 'desc' },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = versions.length > limit;
  const page = hasMore ? versions.slice(0, limit) : versions;
  return { versions: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

/** Single immutable version by number, for diff / detail views. */
export async function getVersion(slug: string, version: number): Promise<FacilitationGraphVersion> {
  const graph = await loadGraph(slug);
  const row = await prisma.facilitationGraphVersion.findUnique({
    where: { graphId_version: { graphId: graph.id, version } },
  });
  if (!row) throw new NotFoundError(`Facilitation map "${slug}" has no version ${version}`);
  return row;
}
