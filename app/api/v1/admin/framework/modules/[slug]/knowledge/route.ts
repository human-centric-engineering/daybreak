/**
 * Framework module knowledge scope — list / grant / revoke (f-module-bindings t-4).
 *
 * GET    /api/v1/admin/framework/modules/:slug/knowledge — the module's granted
 *        documents and tags, each stitched with display fields.
 * POST   /api/v1/admin/framework/modules/:slug/knowledge — grant a document or tag
 *        (`{ documentId }` XOR `{ tagId }`); 201.
 * DELETE /api/v1/admin/framework/modules/:slug/knowledge?documentId=… | ?tagId=… —
 *        revoke a document or tag from the scope.
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`.
 * Mutations are audited in the service, which also invalidates the resolver cache for
 * the module's bound agents. The knowledge-management *page* is `f-ops-views` (15) —
 * this is the API-first surface it drives. Enforcement is the core
 * `resolveAgentDocumentAccess` resolver (a restricted bound agent inherits the scope).
 */

import type { NextRequest } from 'next/server';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { listModuleKnowledge } from '@/lib/framework/modules/knowledge/queries';
import {
  grantModuleDocument,
  grantModuleTag,
  revokeModuleDocument,
  revokeModuleTag,
} from '@/lib/framework/modules/knowledge/service';
import {
  parseModuleSlug,
  grantModuleKnowledgeBodySchema,
  revokeModuleKnowledgeQuerySchema,
} from '@/lib/framework/modules/knowledge/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const scope = await listModuleKnowledge(slug);

  log.info('Framework module knowledge scope listed', {
    slug,
    documents: scope.documents.length,
    tags: scope.tags.length,
  });
  return successResponse(scope);
});

export const POST = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const body = await validateRequestBody(request, grantModuleKnowledgeBodySchema);
  const common = { moduleSlug: slug, userId: session.user.id, clientIp };

  // The schema guarantees exactly one target; narrow on each so neither needs a
  // non-null assertion.
  if (body.documentId !== undefined) {
    await grantModuleDocument({ ...common, documentId: body.documentId });
  } else if (body.tagId !== undefined) {
    await grantModuleTag({ ...common, tagId: body.tagId });
  }

  log.info('Framework module knowledge granted', {
    slug,
    documentId: body.documentId,
    tagId: body.tagId,
    adminId: session.user.id,
  });
  return successResponse({ granted: true }, undefined, { status: 201 });
});

export const DELETE = withAdminAuth<{ slug: string }>(
  async (request: NextRequest, session, { params }) => {
    const clientIp = getClientIP(request);
    const log = await getRouteLogger(request);
    const slug = parseModuleSlug((await params).slug);

    const { searchParams } = new URL(request.url);
    // `|| undefined` (not `??`) so a present-but-empty param (`?documentId=`) is treated
    // as absent — it hits the "exactly one" refine cleanly instead of a cuid error.
    const query = revokeModuleKnowledgeQuerySchema.parse({
      documentId: searchParams.get('documentId') || undefined,
      tagId: searchParams.get('tagId') || undefined,
    });
    const common = { moduleSlug: slug, userId: session.user.id, clientIp };

    if (query.documentId !== undefined) {
      await revokeModuleDocument({ ...common, documentId: query.documentId });
    } else if (query.tagId !== undefined) {
      await revokeModuleTag({ ...common, tagId: query.tagId });
    }

    log.info('Framework module knowledge revoked', {
      slug,
      documentId: query.documentId,
      tagId: query.tagId,
      adminId: session.user.id,
    });
    return successResponse({ revoked: true });
  }
);
