/**
 * Atlas aggregate readers (f-atlas t-1) — the ALL-MODULES widenings of the shipped per-module
 * binding/grant readers.
 *
 * The module binding/grant queries (`modules/bindings|workflow-bindings|knowledge/queries.ts`) each
 * read ONE module (`where: { moduleId }`) + one batched core-row stitch. The atlas needs every
 * module's bindings at once — and its cross-cutting lenses ("where else is this agent used?") need
 * the whole set regardless — so re-reading them per module would be a fan-out. These readers keep
 * the exact **canonical batch-stitch** (collect ids → one `findMany where id in` → `Map` → stitch,
 * `?? null` on a missing/tombstoned core row), just widened from one module to all: one query for
 * the pivot rows + one for the stitched core rows, independent of the module count.
 *
 * Pure reads; the `moduleId → slug` mapping and the projection assembly are `./assemble`.
 */

import type {
  FacilitationGraphVersion,
  ModuleAgentBinding,
  ModuleWorkflowBinding,
} from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { mapDefinitionSchema, type MapDefinition } from '@/lib/framework/facilitation/map/schema';
import { logger } from '@/lib/logging';

/** A module agent binding stitched with the bound agent's display fields, carrying `moduleId`. */
export interface AllModuleAgentBinding extends ModuleAgentBinding {
  agent: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    deletedAt: Date | null;
  } | null;
}

/** Every module's agent bindings, primary-first then role, each stitched with its agent (one query
 *  for bindings + one for agents, whatever the module count). */
export async function listAllModuleAgentBindings(): Promise<AllModuleAgentBinding[]> {
  const bindings = await prisma.moduleAgentBinding.findMany({
    orderBy: [{ moduleId: 'asc' }, { isPrimary: 'desc' }, { role: 'asc' }],
  });
  if (bindings.length === 0) return [];

  const agentIds = [...new Set(bindings.map((b) => b.agentId))];
  const agents = await prisma.aiAgent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, slug: true, isActive: true, deletedAt: true },
  });
  const byId = new Map(agents.map((a) => [a.id, a]));
  return bindings.map((b) => ({ ...b, agent: byId.get(b.agentId) ?? null }));
}

/** A module workflow binding stitched with the bound workflow's display fields, carrying `moduleId`. */
export interface AllModuleWorkflowBinding extends ModuleWorkflowBinding {
  workflow: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    hasPublishedVersion: boolean;
  } | null;
}

/** Every module's workflow bindings, newest first, each stitched with its workflow. */
export async function listAllModuleWorkflowBindings(): Promise<AllModuleWorkflowBinding[]> {
  const bindings = await prisma.moduleWorkflowBinding.findMany({
    orderBy: [{ moduleId: 'asc' }, { createdAt: 'desc' }],
  });
  if (bindings.length === 0) return [];

  const workflowIds = [...new Set(bindings.map((b) => b.workflowId))];
  const workflows = await prisma.aiWorkflow.findMany({
    where: { id: { in: workflowIds } },
    select: { id: true, name: true, slug: true, isActive: true, publishedVersionId: true },
  });
  const byId = new Map(workflows.map((w) => [w.id, w]));
  return bindings.map((b) => {
    const w = byId.get(b.workflowId);
    return {
      ...b,
      workflow: w
        ? {
            id: w.id,
            name: w.name,
            slug: w.slug,
            isActive: w.isActive,
            hasPublishedVersion: w.publishedVersionId !== null,
          }
        : null,
    };
  });
}

/** A single knowledge grant (document or tag) stitched with display fields, carrying `moduleId`. */
export interface AllModuleKnowledgeGrant {
  moduleId: string;
  kind: 'document' | 'tag';
  /** The granted entity's id (document id or tag id). */
  entityId: string;
  name: string | null;
  slug: string | null;
  /** Document status; null for tags and for a removed document. */
  status: string | null;
}

/** Every module's knowledge grants (documents + tags) across all modules, each stitched — four
 *  queries total (two pivots + two core stitches), independent of the module count. */
export async function listAllModuleKnowledgeGrants(): Promise<AllModuleKnowledgeGrant[]> {
  const [docGrants, tagGrants] = await Promise.all([
    prisma.moduleKnowledgeDocument.findMany({ select: { moduleId: true, documentId: true } }),
    prisma.moduleKnowledgeTag.findMany({ select: { moduleId: true, tagId: true } }),
  ]);

  const documentIds = [...new Set(docGrants.map((g) => g.documentId))];
  const tagIds = [...new Set(tagGrants.map((g) => g.tagId))];

  const [documents, tags] = await Promise.all([
    documentIds.length === 0
      ? []
      : prisma.aiKnowledgeDocument.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, name: true, slug: true, status: true },
        }),
    tagIds.length === 0
      ? []
      : prisma.knowledgeTag.findMany({
          where: { id: { in: tagIds } },
          select: { id: true, name: true, slug: true },
        }),
  ]);
  const docById = new Map(documents.map((d) => [d.id, d]));
  const tagById = new Map(tags.map((t) => [t.id, t]));

  return [
    ...docGrants.map((g): AllModuleKnowledgeGrant => {
      const d = docById.get(g.documentId);
      return {
        moduleId: g.moduleId,
        kind: 'document',
        entityId: g.documentId,
        name: d?.name ?? null,
        slug: d?.slug ?? null,
        status: d?.status ?? null,
      };
    }),
    ...tagGrants.map((g): AllModuleKnowledgeGrant => {
      const t = tagById.get(g.tagId);
      return {
        moduleId: g.moduleId,
        kind: 'tag',
        entityId: g.tagId,
        name: t?.name ?? null,
        slug: t?.slug ?? null,
        status: null,
      };
    }),
  ];
}

/** A published map's parsed topology, or a degraded empty one. `version`/`definition` are null when
 *  the graph has no published version; `definition` is null (with `version` set) when the stored
 *  blob failed to parse — a corrupt map degrades to an empty node in the atlas rather than 500-ing
 *  the whole picture. */
export interface AtlasPublishedMap {
  slug: string;
  name: string;
  version: number | null;
  definition: MapDefinition | null;
}

/** Every facilitation map with its published topology (two queries: graphs + their published
 *  versions), each parsed defensively. Unpublished ⇒ `{ version: null, definition: null }`. */
export async function listPublishedMaps(): Promise<AtlasPublishedMap[]> {
  const graphs = await prisma.facilitationGraph.findMany({
    orderBy: { slug: 'asc' },
    select: { slug: true, name: true, publishedVersionId: true },
  });
  if (graphs.length === 0) return [];

  const versionIds = graphs
    .map((g) => g.publishedVersionId)
    .filter((id): id is string => id !== null);
  const versions =
    versionIds.length === 0
      ? []
      : await prisma.facilitationGraphVersion.findMany({
          where: { id: { in: versionIds } },
          select: { id: true, version: true, definition: true },
        });
  const byId = new Map<string, Pick<FacilitationGraphVersion, 'version' | 'definition'>>(
    versions.map((v) => [v.id, v])
  );

  return graphs.map((g): AtlasPublishedMap => {
    const published = g.publishedVersionId ? byId.get(g.publishedVersionId) : undefined;
    if (!published) return { slug: g.slug, name: g.name, version: null, definition: null };

    const parsed = mapDefinitionSchema.safeParse(published.definition);
    if (!parsed.success) {
      // A corrupt published map should not break the whole atlas — degrade to an empty topology
      // (the map node still renders, without its places). Logged so the corruption is visible.
      logger.error('atlas: published map failed to parse — degrading to empty topology', {
        slug: g.slug,
        version: published.version,
      });
      return { slug: g.slug, name: g.name, version: published.version, definition: null };
    }
    return { slug: g.slug, name: g.name, version: published.version, definition: parsed.data };
  });
}
