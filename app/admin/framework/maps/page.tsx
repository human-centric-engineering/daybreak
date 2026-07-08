import type { Metadata } from 'next';

import { MapsTable, type MapListItem } from '@/components/admin/framework/maps-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Maps · Framework',
  description: 'Author and manage facilitation maps — the geography users travel.',
};

/**
 * Every facilitation map, from the enriched list endpoint. A fetch failure never
 * throws — the table renders its empty state so the page stays usable (the
 * modules-list / journeys-list precedent).
 */
async function getMaps(): Promise<MapListItem[]> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/maps');
    if (!res.ok) return [];
    const body = await parseApiResponse<MapListItem[]>(res);
    return body.success ? body.data : [];
  } catch (err) {
    logger.error('framework maps list page: initial fetch failed', err);
    return [];
  }
}

export default async function FrameworkMapsPage() {
  const maps = await getMaps();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">
          Maps{' '}
          <FieldHelp title="What is a facilitation map?" contentClassName="w-96">
            <p>
              A <strong>facilitation map</strong> is the authored geography a user travels — its
              nodes (places, stages, milestones, regions) and the typed edges between them.
            </p>
            <p className="mt-2">
              Pick a map to open the editor: drop nodes, wire edges, configure gating, and publish a
              version. The engine interprets a user&rsquo;s journey against the map&rsquo;s live
              published version.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The facilitation maps authors build and publish.
        </p>
      </header>

      <MapsTable initialMaps={maps} />
    </div>
  );
}
