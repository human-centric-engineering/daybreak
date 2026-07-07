import type { Metadata } from 'next';

import { JourneysTable } from '@/components/admin/framework/journeys-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { JourneyListItem } from '@/lib/framework/facilitation/journey/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Journeys · Framework',
  description: 'Explore how individual users have travelled the facilitation maps.',
};

/** How many journeys the picker pre-renders. Search filters this page (full-set
 *  search is a recorded follow-up); the "showing first N" hint fires past this. */
const PAGE_LIMIT = 100;

/**
 * The first page of journeys plus the unfiltered total (for the cap hint). A fetch
 * failure never throws — the table renders its empty state so the page stays usable
 * (the modules-list precedent). `total` comes from the paginated envelope's `meta`,
 * read defensively (its type is an open record).
 */
async function getJourneys(): Promise<{ items: JourneyListItem[]; total: number }> {
  try {
    const res = await serverFetch(`/api/v1/admin/framework/journeys?limit=${PAGE_LIMIT}`);
    if (!res.ok) return { items: [], total: 0 };
    const body = await parseApiResponse<JourneyListItem[]>(res);
    if (!body.success) return { items: [], total: 0 };
    const total = typeof body.meta?.total === 'number' ? body.meta.total : body.data.length;
    return { items: body.data, total };
  } catch (err) {
    logger.error('framework journeys list page: initial fetch failed', err);
    return { items: [], total: 0 };
  }
}

export default async function FrameworkJourneysPage() {
  const { items, total } = await getJourneys();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">
          Journeys{' '}
          <FieldHelp title="What is a journey?" contentClassName="w-96">
            <p>
              A <strong>journey</strong> is one user&rsquo;s traversal of a facilitation map — the
              per-node state the engine writes as they move through it.
            </p>
            <p className="mt-2">
              Pick a journey to see it laid out on a read-only map coloured by node state, and
              replay the user&rsquo;s path from the event log. This is a support view: it reads
              other users&rsquo; journeys, so it is admin-only.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Individual user journeys across the facilitation maps.
        </p>
      </header>

      <JourneysTable initialJourneys={items} total={total} />
    </div>
  );
}
