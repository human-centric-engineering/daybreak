import type { Metadata } from 'next';

import { AtlasView } from '@/components/admin/framework/atlas/atlas-view';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { CompositionProjection } from '@/lib/framework/atlas/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Atlas · Framework',
  description: 'The whole framework configuration as one read-only composition graph.',
};

/** The composition projection, or `null` on any fetch failure (a distinct "couldn't load" state — the
 *  atlas is a pure read, so there is no 404: an empty deployment returns a valid empty projection). */
async function getComposition(): Promise<CompositionProjection | null> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/atlas');
    if (!res.ok) return null;
    const body = await parseApiResponse<CompositionProjection>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('framework atlas: fetch failed', err);
    return null;
  }
}

export default async function FrameworkAtlasPage() {
  const projection = await getComposition();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Atlas</h1>
        <p className="text-muted-foreground text-sm">
          What the framework is made of — modules, the facilitation layer, and published maps, with
          their agents, workflows, slots, capabilities, and knowledge. Click any node to open its
          editor.
        </p>
      </header>

      {projection === null ? (
        <p className="text-muted-foreground rounded-md border p-8 text-center text-sm" role="alert">
          The atlas couldn&rsquo;t be loaded. Try refreshing the page.
        </p>
      ) : (
        <AtlasView projection={projection} />
      )}
    </div>
  );
}
