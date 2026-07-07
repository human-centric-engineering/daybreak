/**
 * Facilitation policy service (f-policies t-1) — the only module that writes
 * `framework_facilitation_policy` rows.
 *
 * The write side of the typed-policy spine (spec §5.5, F14): create / update / delete a
 * `FacilitationPolicy`, with the `(kind, payload)` pair validated against its kind's Zod schema
 * (`assertValidFacilitationPolicy`) before every write — an unknown kind or a payload that doesn't
 * match its kind is a clean `ValidationError` (→ 400), never a raw Prisma/DB error. `kind` is
 * IMMUTABLE (a policy's kind is its identity — changing it is delete + create), so an update only
 * touches `payload` / `enabled`, re-validating the new payload against the existing kind. Every
 * write emits a `logAdminAction` audit entry (F14 change-control reuse). Reads live in
 * `./policy-queries`.
 */

import { Prisma } from '@prisma/client';
import type { FacilitationPolicy } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { mapPrismaWriteError } from '@/lib/framework/shared/prisma-errors';
import { assertValidFacilitationPolicy } from '@/lib/framework/facilitation/policies/kinds';

const ENTITY_TYPE = 'facilitation_policy';

/** Load a policy by id, or 404. */
async function loadPolicy(policyId: string): Promise<Pick<FacilitationPolicy, 'id' | 'kind'>> {
  const existing = await prisma.facilitationPolicy.findUnique({
    where: { id: policyId },
    select: { id: true, kind: true },
  });
  if (!existing) throw new NotFoundError(`Facilitation policy "${policyId}" not found`);
  return existing;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CreateFacilitationPolicyArgs {
  kind: string;
  payload: unknown;
  enabled?: boolean;
  userId: string;
  clientIp?: string | null;
}

/**
 * Create a policy. Validates `(kind, payload)` against the kind's schema (bad ⇒ `ValidationError`)
 * and stamps `createdBy` for audit attribution.
 */
export async function createFacilitationPolicy(
  args: CreateFacilitationPolicyArgs
): Promise<FacilitationPolicy> {
  const { kind, payload, enabled, userId, clientIp } = args;
  const valid = assertValidFacilitationPolicy(kind, payload);

  const policy = await prisma.facilitationPolicy.create({
    data: {
      kind: valid.kind,
      payload: valid.payload,
      ...(enabled !== undefined ? { enabled } : {}),
      createdBy: userId,
    },
  });

  logAdminAction({
    userId,
    action: 'facilitation_policy.create',
    entityType: ENTITY_TYPE,
    entityId: policy.id,
    entityName: policy.kind,
    metadata: { kind: policy.kind, enabled: policy.enabled },
    clientIp: clientIp ?? null,
  });

  return policy;
}

export interface UpdateFacilitationPolicyArgs {
  policyId: string;
  /** When present, re-validated against the existing (immutable) kind. */
  payload?: unknown;
  enabled?: boolean;
  userId: string;
  clientIp?: string | null;
}

/** Update a policy's `payload` and/or `enabled`. `kind` is immutable (change = delete + create). */
export async function updateFacilitationPolicy(
  args: UpdateFacilitationPolicyArgs
): Promise<FacilitationPolicy> {
  const { policyId, payload, enabled, userId, clientIp } = args;
  const existing = await loadPolicy(policyId);

  const data: Prisma.FacilitationPolicyUpdateInput = {};
  if (payload !== undefined) {
    const valid = assertValidFacilitationPolicy(existing.kind, payload);
    data.payload = valid.payload;
  }
  if (enabled !== undefined) data.enabled = enabled;

  let policy: FacilitationPolicy;
  try {
    policy = await prisma.facilitationPolicy.update({ where: { id: policyId }, data });
  } catch (err) {
    // P2025 = the row was deleted between the guard and the write → the 404 the guard would raise.
    mapPrismaWriteError(err, { notFound: `Facilitation policy "${policyId}" not found` });
  }

  logAdminAction({
    userId,
    action: 'facilitation_policy.update',
    entityType: ENTITY_TYPE,
    entityId: policy.id,
    entityName: policy.kind,
    metadata: { kind: policy.kind, enabled: policy.enabled },
    clientIp: clientIp ?? null,
  });

  return policy;
}

export interface DeleteFacilitationPolicyArgs {
  policyId: string;
  userId: string;
  clientIp?: string | null;
}

/** Delete a policy. */
export async function deleteFacilitationPolicy(args: DeleteFacilitationPolicyArgs): Promise<void> {
  const { policyId, userId, clientIp } = args;
  const existing = await loadPolicy(policyId);

  try {
    await prisma.facilitationPolicy.delete({ where: { id: policyId } });
  } catch (err) {
    mapPrismaWriteError(err, { notFound: `Facilitation policy "${policyId}" not found` });
  }

  logAdminAction({
    userId,
    action: 'facilitation_policy.delete',
    entityType: ENTITY_TYPE,
    entityId: policyId,
    entityName: existing.kind,
    metadata: { kind: existing.kind },
    clientIp: clientIp ?? null,
  });
}
