/**
 * Facilitation agent-binding service (f-facilitation-agents t-1) — the only module that
 * writes `framework_facilitation_agent` rows.
 *
 * Binds an ordinary `AiAgent` into a facilitation **seat** (`role`, validated against the
 * framework-owned `FACILITATION_ROLES`). The **second scope of the one binding mechanism**
 * (the first is `ModuleAgentBinding`) — but FLAT: there is no module to key on, a role is the
 * seat, and `@@unique([role])` keeps exactly one agent per seat deployment-wide. Agents are
 * never owned: nothing here touches `AiAgent`.
 *
 * `agentId` has no Prisma relation (X6 boundary — no reverse field on core `AiAgent`), so its
 * FK + `ON DELETE CASCADE` live in the migration SQL. Reads live in `./binding-queries` (they
 * stitch the agent's display fields, which `include` can't). Every write emits a
 * `logAdminAction` audit entry (spec §7). Unlike `ModuleAgentBinding`, a facilitation binding
 * feeds **no** knowledge scope, so there is no agent-access cache to evict.
 */

import { Prisma } from '@prisma/client';
import type { FacilitationAgentBinding } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { mapPrismaWriteError } from '@/lib/framework/shared/prisma-errors';
import {
  isFacilitationRole,
  FACILITATION_ROLE_VALUES,
} from '@/lib/framework/facilitation/agents/roles';

const ENTITY_TYPE = 'facilitation_agent_binding';

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Assert `role` is a declared facilitation seat (the fixed framework vocabulary). */
function assertFacilitationSeat(role: string): void {
  if (!isFacilitationRole(role)) {
    throw new ValidationError(`Role "${role}" is not a facilitation seat`, {
      role: [`Must be one of: ${FACILITATION_ROLE_VALUES.join(', ')}`],
    });
  }
}

/** Assert a bindable (active, not soft-deleted) agent exists. */
async function assertAgentExists(agentId: string): Promise<void> {
  const agent = await prisma.aiAgent.findFirst({
    where: { id: agentId, deletedAt: null },
    select: { id: true },
  });
  if (!agent) {
    throw new ValidationError('Agent not found', { agentId: [`No active agent "${agentId}"`] });
  }
}

/** Load a binding by id, or 404. */
async function loadBinding(
  bindingId: string
): Promise<Pick<FacilitationAgentBinding, 'id' | 'agentId' | 'role'>> {
  const existing = await prisma.facilitationAgentBinding.findUnique({
    where: { id: bindingId },
    select: { id: true, agentId: true, role: true },
  });
  if (!existing) throw new NotFoundError(`Facilitation binding "${bindingId}" not found`);
  return existing;
}

/**
 * Map a Prisma write error to a domain error, or rethrow. `P2002` on the
 * `@@unique([role])` index — the seat is already filled by another agent (changing which
 * agent serves a seat is an unbind + rebind, not a patch) — becomes a clean `ValidationError`;
 * `P2025` (the binding was removed between the guard and the write) becomes the 404 the guard
 * would have raised.
 */
function rethrowBindingWriteError(err: unknown, ctx: { role?: string }): never {
  mapPrismaWriteError(err, {
    onUnique: () => {
      throw new ValidationError('That facilitation seat is already bound to an agent', {
        role: [`"${ctx.role}" already has a bound agent — unbind it first to reassign the seat`],
      });
    },
    notFound: 'Facilitation binding was removed concurrently',
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BindFacilitationAgentArgs {
  agentId: string;
  role: string;
  config?: Record<string, unknown>;
  userId: string;
  clientIp?: string | null;
}

/**
 * Bind an agent into a facilitation seat. Validates the seat against `FACILITATION_ROLES`
 * and that the agent exists. A seat already filled by another agent is a `ValidationError`,
 * not a raw Prisma constraint error.
 */
export async function bindFacilitationAgent(
  args: BindFacilitationAgentArgs
): Promise<FacilitationAgentBinding> {
  const { agentId, role, config, userId, clientIp } = args;

  assertFacilitationSeat(role);
  await assertAgentExists(agentId);

  let binding: FacilitationAgentBinding;
  try {
    binding = await prisma.facilitationAgentBinding.create({
      data: {
        agentId,
        role,
        ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    rethrowBindingWriteError(err, { role });
  }

  logAdminAction({
    userId,
    action: 'facilitation_agent_binding.create',
    entityType: ENTITY_TYPE,
    entityId: binding.id,
    entityName: role,
    metadata: { agentId, role },
    clientIp: clientIp ?? null,
  });

  return binding;
}

export interface UpdateFacilitationBindingArgs {
  bindingId: string;
  /** `null` = clear; object = set. (The only mutable field — reassigning the seat is
   *  unbind + rebind.) */
  config: Record<string, unknown> | null;
  userId: string;
  clientIp?: string | null;
}

/** Update a binding's config override. The seat (`role`) is immutable here. */
export async function updateFacilitationBinding(
  args: UpdateFacilitationBindingArgs
): Promise<FacilitationAgentBinding> {
  const { bindingId, config, userId, clientIp } = args;

  await loadBinding(bindingId);

  let binding: FacilitationAgentBinding;
  try {
    binding = await prisma.facilitationAgentBinding.update({
      where: { id: bindingId },
      data: { config: config === null ? Prisma.JsonNull : (config as Prisma.InputJsonValue) },
    });
  } catch (err) {
    rethrowBindingWriteError(err, {});
  }

  logAdminAction({
    userId,
    action: 'facilitation_agent_binding.update',
    entityType: ENTITY_TYPE,
    entityId: binding.id,
    entityName: binding.role,
    metadata: { bindingId },
    clientIp: clientIp ?? null,
  });

  return binding;
}

export interface UnbindFacilitationAgentArgs {
  bindingId: string;
  userId: string;
  clientIp?: string | null;
}

/** Remove a facilitation binding (frees the seat). */
export async function unbindFacilitationAgent(args: UnbindFacilitationAgentArgs): Promise<void> {
  const { bindingId, userId, clientIp } = args;

  const existing = await loadBinding(bindingId);

  try {
    await prisma.facilitationAgentBinding.delete({ where: { id: bindingId } });
  } catch (err) {
    rethrowBindingWriteError(err, {});
  }

  logAdminAction({
    userId,
    action: 'facilitation_agent_binding.delete',
    entityType: ENTITY_TYPE,
    entityId: bindingId,
    entityName: existing.role,
    metadata: { agentId: existing.agentId, role: existing.role },
    clientIp: clientIp ?? null,
  });
}
