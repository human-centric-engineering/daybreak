import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ModuleDetail } from '@/components/admin/framework/module-detail/module-detail';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type {
  ModuleConfigFormView,
  ModuleListItem,
  ModuleVersionsView,
} from '@/lib/framework/modules/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Module · Framework',
  description: 'Configure a framework module and review its config history.',
};

const EMPTY_VERSIONS: ModuleVersionsView = { versions: [], nextCursor: null };

/**
 * The module's identity row, found in the shipped list endpoint (`GET /modules`). t-2 is
 * UI over 06/03's already-shipped APIs, so it reads the list rather than adding a
 * single-module GET (that lands with the lifecycle writes in t-3). Returns `null` when the
 * module doesn't exist → the page 404s.
 *
 * Relies on `GET /modules` being unpaginated/uncapped (`listModules()` is a `findMany` with
 * no `take`), so `.find` never misses a module past a first page. If t-3 ever paginates the
 * list, this must switch to a single-module GET or the detail page will false-404.
 */
async function getIdentity(slug: string): Promise<ModuleListItem | null> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/modules');
    if (!res.ok) return null;
    const body = await parseApiResponse<ModuleListItem[]>(res);
    if (!body.success) return null;
    return body.data.find((m) => m.slug === slug) ?? null;
  } catch (err) {
    logger.error('framework module detail: identity fetch failed', err);
    return null;
  }
}

/**
 * The generic config form (descriptors + current values). Returns `null` on a fetch
 * failure — distinct from a successful `{ registered: false }` (a genuinely unregistered
 * module), so a transient error is never shown as the false claim "this module's code is
 * no longer registered".
 */
async function getConfig(slug: string): Promise<ModuleConfigFormView | null> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/config`
    );
    if (!res.ok) return null;
    const body = await parseApiResponse<ModuleConfigFormView>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('framework module detail: config fetch failed', err);
    return null;
  }
}

/** The most recent config versions (first page). Degrades to an empty list. */
async function getVersions(slug: string): Promise<ModuleVersionsView> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/versions`
    );
    if (!res.ok) return EMPTY_VERSIONS;
    const body = await parseApiResponse<ModuleVersionsView>(res);
    return body.success ? body.data : EMPTY_VERSIONS;
  } catch (err) {
    logger.error('framework module detail: versions fetch failed', err);
    return EMPTY_VERSIONS;
  }
}

/**
 * Admin — Framework Module detail (f-ops-views t-2).
 *
 * Thin server component: fetches the module's identity, config form, and version list in
 * parallel, then hands them to the client `<ModuleDetail>` tabbed shell (Config + Versions
 * tabs; t-3/t-4 append Settings / binding tabs). 404s when the module doesn't exist; other
 * fetch failures degrade to empty state rather than throwing (the list-page precedent).
 */
export default async function FrameworkModuleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [identity, config, versions] = await Promise.all([
    getIdentity(slug),
    getConfig(slug),
    getVersions(slug),
  ]);

  if (!identity) notFound();

  return <ModuleDetail slug={slug} identity={identity} config={config} versions={versions} />;
}
