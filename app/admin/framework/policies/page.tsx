import type { Metadata } from 'next';

import { PoliciesTable } from '@/components/admin/framework/policies/policies-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { FacilitationPolicyView } from '@/lib/framework/facilitation/policies/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Policies · Framework',
  description: 'Governance policies — approval, gating, guard floors, and escalation.',
};

/**
 * Admin — Framework Policies list (f-admin-surfaces t-2).
 *
 * A thin server component that pre-renders the facilitation-policy list via
 * `serverFetch(GET /facilitation/policies)` and hands it to the client
 * `<PoliciesTable>` for create / edit / enable / delete over the shipped CRUD API.
 * Framework-tier per the X6 boundary. A fetch failure never throws — the table renders
 * an empty state so the page stays usable (the modules / journeys / slots precedent).
 * Policy counts are small, so the full set pre-renders and the client filters within it.
 */
async function getPolicies(): Promise<FacilitationPolicyView[]> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/facilitation/policies');
    if (!res.ok) return [];
    const body = await parseApiResponse<FacilitationPolicyView[]>(res);
    if (!body.success) return [];
    return body.data;
  } catch (err) {
    logger.error('framework policies list page: initial fetch failed', err);
    return [];
  }
}

export default async function FrameworkPoliciesPage() {
  const policies = await getPolicies();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">
          Policies{' '}
          <FieldHelp title="What are governance policies?" contentClassName="w-96">
            <p>
              A <strong>governance policy</strong> is a small typed rule that shapes facilitation —
              which structure changes may auto-approve, which roles a user may reach on a map, the
              minimum guard level a role enforces, and when a guard event escalates to a human.
            </p>
            <p className="mt-2">
              Each policy has a fixed <em>kind</em> and its own parameters. A disabled policy is
              retained but not enforced.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The typed governance rules that shape approval, gating, guard floors, and escalation.
        </p>
      </header>

      <PoliciesTable initialPolicies={policies} />
    </div>
  );
}
