import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JourneyExplorer } from '@/components/admin/framework/journey-explorer/journey-explorer';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { JourneyDetailView } from '@/lib/framework/facilitation/journey/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Journey · Framework',
  description: 'Explore and replay one user’s traversal of a facilitation map.',
};

/**
 * The journey detail bundle, or a distinct signal per outcome: `'not-found'` when the
 * endpoint 404s (a genuinely missing journey → the page 404s), `null` when the fetch
 * fails for any other reason (a transient error → a "couldn't load" state, never a
 * false 404). Only a real miss 404s.
 */
async function getJourneyDetail(id: string): Promise<JourneyDetailView | 'not-found' | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/framework/journeys/${encodeURIComponent(id)}`);
    if (res.status === 404) return 'not-found';
    if (!res.ok) return null;
    const body = await parseApiResponse<JourneyDetailView>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('framework journey detail: fetch failed', err);
    return null;
  }
}

export default async function FrameworkJourneyDetailPage({
  params,
}: {
  params: Promise<{ journeyId: string }>;
}) {
  const { journeyId } = await params;
  const detail = await getJourneyDetail(journeyId);

  if (detail === 'not-found') notFound();

  if (!detail) {
    return (
      <p className="text-muted-foreground rounded-md border p-8 text-center text-sm" role="alert">
        This journey couldn&rsquo;t be loaded. Try refreshing the page.
      </p>
    );
  }

  return <JourneyExplorer detail={detail} />;
}
