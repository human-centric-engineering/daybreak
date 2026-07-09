/**
 * Facilitation policy read queries (f-policies t-1) — the read side of
 * `framework_facilitation_policy`, split from the writer (`./policy-service`) the way the
 * facilitation agent bindings split their queries from the service.
 *
 * `FacilitationPolicy` has no relation to stitch (it references roles/scopes by string, not by
 * FK), so reads are plain. Ordered `kind` then `createdAt` for a stable admin listing.
 */

import type { FacilitationPolicy } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';

/** Load a single policy by id, or 404. Used by the emergence proposal pipeline to resolve the
 *  target policy's (immutable) kind before validating a proposed payload against it. */
export async function getFacilitationPolicy(id: string): Promise<FacilitationPolicy> {
  const policy = await prisma.facilitationPolicy.findUnique({ where: { id } });
  if (!policy) throw new NotFoundError(`Facilitation policy "${id}" not found`);
  return policy;
}

/**
 * List policies, optionally filtered to one `kind`. Returns every policy (enabled or not) so the
 * admin surface can manage disabled rows; runtime resolvers (t-2+) filter to `enabled` themselves.
 */
export async function listFacilitationPolicies(kind?: string): Promise<FacilitationPolicy[]> {
  return prisma.facilitationPolicy.findMany({
    where: kind !== undefined ? { kind } : undefined,
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * The ENABLED policies of one kind, for a runtime resolver (t-2+ enforcement). Uses the
 * `[kind, enabled]` index; ordered oldest-first for a deterministic evaluation order.
 */
export async function listEnabledFacilitationPolicies(kind: string): Promise<FacilitationPolicy[]> {
  return prisma.facilitationPolicy.findMany({
    where: { kind, enabled: true },
    orderBy: { createdAt: 'asc' },
  });
}
