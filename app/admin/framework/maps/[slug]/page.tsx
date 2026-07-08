import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  MapBuilder,
  type MapEditorGraph,
} from '@/components/admin/framework/map-builder/map-builder';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Map editor · Framework',
  description: 'Author a facilitation map on the canvas — nodes, edges, and versions.',
};

/**
 * The map (with its published version), or a distinct signal per outcome: `'not-found'`
 * when the endpoint 404s (a genuinely missing map → the page 404s), `null` on any other
 * failure (a transient error → a "couldn't load" state, never a false 404). Only a real
 * miss 404s — the journey-detail precedent.
 */
async function getMap(slug: string): Promise<MapEditorGraph | 'not-found' | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/framework/maps/${encodeURIComponent(slug)}`);
    if (res.status === 404) return 'not-found';
    if (!res.ok) return null;
    const body = await parseApiResponse<MapEditorGraph>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('framework map editor: fetch failed', err);
    return null;
  }
}

export default async function FrameworkMapEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const graph = await getMap(slug);

  if (graph === 'not-found') notFound();

  if (!graph) {
    return (
      <p className="text-muted-foreground rounded-md border p-8 text-center text-sm" role="alert">
        This map couldn&rsquo;t be loaded. Try refreshing the page.
      </p>
    );
  }

  return <MapBuilder graph={graph} />;
}
