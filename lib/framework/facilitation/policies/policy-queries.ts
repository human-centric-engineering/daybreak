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
