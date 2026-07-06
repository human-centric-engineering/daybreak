/**
 * Module surface resolution (f-guidance t-5, spec X5) — "conversations are surface-scoped;
 * continuity is carried by state, not by threads."
 *
 * A module's chat companion is its own `AiConversation` with the module's **bound primary
 * agent**. This resolves that surface for a `(user, module)`: the primary agent to talk to,
 * the user's existing surface conversation to resume (if any), and the **scope map that
 * carries the module slug**. Populating `scope.moduleSlug` here is the write half that
 * completes f-module-bindings' `isInModuleScope` reader (allow-on-absent until a surface
 * pins the scope) — so a module capability now actually refuses out-of-module calls.
 *
 * Conversation resume is a framework-side lookup (most-recent active surface conversation
 * for the `(user, agent, module)`), because the core conversation model has no
 * `(contextType, contextId)` uniqueness / resume path — decision 8.
 */

import { prisma } from '@/lib/db/client';
import { encodeScope } from '@/lib/framework/shared/scope';
import { listModuleBindings } from '@/lib/framework/modules/bindings/queries';

/** The `AiConversation.contextType` a module surface's conversation is tagged with. */
export const MODULE_SURFACE_CONTEXT_TYPE = 'module';

/** The resolved surface a chat route needs to open/continue a module conversation. */
export interface ModuleSurface {
  agentSlug: string;
  agentId: string;
  /** An existing surface conversation to resume, or `undefined` to open a new one. */
  conversationId: string | undefined;
  /** The scope map threaded into `streamChat` — carries `moduleSlug` (X5). */
  scope: Record<string, string>;
  /** The agent's per-agent rate-limit override (RPM), or `null` — the route passes it to
   *  the limiter so the surface honours the same cap as the direct consumer route. */
  rateLimitRpm: number | null;
}

/**
 * Resolve the module's chat surface for a user, or `null` when the module has no usable,
 * end-user-facing primary agent. Propagates `NotFoundError` (from `listModuleBindings`) for
 * an unknown module slug.
 *
 * The bound primary agent must be **`public`**: the surface is end-user-facing, and an
 * `internal` agent (the DEFAULT visibility) carries a system prompt + capabilities not meant
 * for end-users — exposing it here would bypass the same visibility ACL the direct consumer
 * chat route enforces. (`invite_only` needs a token flow this route doesn't carry, so it is
 * excluded too; a richer module-agent access model is `f-facilitation-agents` (13).)
 */
export async function resolveModuleSurface(
  userId: string,
  moduleSlug: string
): Promise<ModuleSurface | null> {
  const bindings = await listModuleBindings(moduleSlug);
  const primary = bindings.find(
    (b) => b.isPrimary && b.agent !== null && b.agent.isActive && b.agent.deletedAt === null
  );
  if (primary === undefined || primary.agent === null) return null;

  // The binding view carries no `visibility`/`rateLimitRpm`, so re-read them. Gate on
  // visibility BEFORE any conversation work: a non-public agent yields no surface (→ 404).
  const agent = await prisma.aiAgent.findUnique({
    where: { id: primary.agent.id },
    select: { visibility: true, rateLimitRpm: true },
  });
  if (agent === null || agent.visibility !== 'public') return null;

  // Resume the most-recent active surface conversation for this (user, agent, module), else
  // leave `conversationId` undefined so `streamChat` opens a new one (tagged with the
  // contextType/contextId the route passes).
  const existing = await prisma.aiConversation.findFirst({
    where: {
      userId,
      agentId: primary.agent.id,
      contextType: MODULE_SURFACE_CONTEXT_TYPE,
      contextId: moduleSlug,
      isActive: true,
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  return {
    agentSlug: primary.agent.slug,
    agentId: primary.agent.id,
    conversationId: existing?.id,
    scope: encodeScope({ moduleSlug }),
    rateLimitRpm: agent.rateLimitRpm,
  };
}
