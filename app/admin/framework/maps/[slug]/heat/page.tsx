import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MapHeatView } from '@/components/admin/framework/map-heat/map-heat-view';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { mapDefinitionSchema, type MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type { MapHeat } from '@/lib/framework/engagement/map-heat';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Map heat · Framework',
  description: 'Collective per-node traffic and drop-off over a facilitation map.',
};

/** The map's identity + published structure, `'not-found'` on a 404, `null` on other failure. */
interface MapForHeat {
  name: string;
  slug: string;
  structure: MapDefinition | null;
}

/** The map endpoint's row shape this page reads (a structural subset). */
interface MapDetailResponse {
  name: string;
  slug: string;
  publishedVersion: { definition: unknown } | null;
}

/** Parse a stored published `definition` into typed structure; `null` if unpublished/unparseable. */
function parseStructure(definition: unknown): MapDefinition | null {
  const parsed = mapDefinitionSchema.safeParse(definition);
  return parsed.success ? parsed.data : null;
}

async function getMap(slug: string): Promise<MapForHeat | 'not-found' | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/framework/maps/${encodeURIComponent(slug)}`);
    if (res.status === 404) return 'not-found';
    if (!res.ok) return null;
    const body = await parseApiResponse<MapDetailResponse>(res);
    if (!body.success) return null;
    return {
      name: body.data.name,
      slug: body.data.slug,
      structure: parseStructure(body.data.publishedVersion?.definition ?? null),
    };
  } catch (err) {
    logger.error('framework map heat: map fetch failed', err);
    return null;
  }
}

/** The collective heat, or `null` on failure (the map still renders all-neutral). */
async function getHeat(slug: string): Promise<MapHeat | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/framework/maps/${encodeURIComponent(slug)}/heat`);
    if (!res.ok) return null;
    const body = await parseApiResponse<MapHeat>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('framework map heat: heat fetch failed', err);
    return null;
  }
}

export default async function FrameworkMapHeatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [map, heat] = await Promise.all([getMap(slug), getHeat(slug)]);

  if (map === 'not-found') notFound();

  if (!map) {
    return (
      <p className="text-muted-foreground rounded-md border p-8 text-center text-sm" role="alert">
        This map&rsquo;s heat couldn&rsquo;t be loaded. Try refreshing the page.
      </p>
    );
  }

  // Heat failing while the map loaded is a soft degrade — render the structure all-neutral
  // (an empty heat), never a false failure. A genuinely cold map is the same empty shape.
  const resolvedHeat: MapHeat = heat ?? { graphSlug: slug, nodes: [] };

  return (
    <MapHeatView
      graphName={map.name}
      graphSlug={map.slug}
      structure={map.structure}
      heat={resolvedHeat}
    />
  );
}
