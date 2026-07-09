import type { Metadata } from 'next';

import { SlotDefinitionsTable } from '@/components/admin/framework/slots/slot-definitions-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { SlotDefinitionView } from '@/lib/framework/data-slots/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Slots · Framework',
  description: 'Registered slot definitions — what the system learns about a user.',
};

/**
 * Admin — Framework Slots list (f-admin-surfaces t-1).
 *
 * A thin server component that pre-renders the slot-definition list via
 * `serverFetch(GET /slot-definitions)` and hands it to the client
 * `<SlotDefinitionsTable>`. Framework-tier per the X6 boundary. A fetch failure never
 * throws — the table renders an empty state so the page stays usable (the modules /
 * journeys list precedent). Slot-definition counts are small (one boot-synced row per
 * declared slot), so the full set pre-renders and the client filters within it.
 */
async function getSlotDefinitions(): Promise<SlotDefinitionView[]> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/slot-definitions');
    if (!res.ok) return [];
    const body = await parseApiResponse<SlotDefinitionView[]>(res);
    if (!body.success) return [];
    return body.data;
  } catch (err) {
    logger.error('framework slots list page: initial fetch failed', err);
    return [];
  }
}

export default async function FrameworkSlotsPage() {
  const definitions = await getSlotDefinitions();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">
          Slots{' '}
          <FieldHelp title="What are slots?" contentClassName="w-96">
            <p>
              A <strong>slot</strong> is a piece of what the system aims to learn about a user —
              defined in code (a module declares its slots), synced to a row here. Each definition
              sets the slot&rsquo;s type, scope, and <em>sensitivity</em>.
            </p>
            <p className="mt-2">
              Open a slot to see its definition and the values captured for it across users. Values
              graded <em>sensitive</em> or <em>special category</em> are masked by default.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registered slot definitions and the values captured against them.
        </p>
      </header>

      <SlotDefinitionsTable initialDefinitions={definitions} />
    </div>
  );
}
