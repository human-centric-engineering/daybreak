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

const EMPTY_CONFIG: ModuleConfigFormView = { registered: false, descriptors: [], values: {} };
const EMPTY_VERSIONS: ModuleVersionsView = { versions: [], nextCursor: null };

/**
 * The module's identity row, found in the shipped list endpoint (`GET /modules`). t-2 is
 * UI over 06/03's already-shipped APIs, so it reads the list rather than adding a
 * single-module GET (that lands with the lifecycle writes in t-3). Returns `null` when the
 * module doesn't exist → the page 404s.
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

/** The generic config form (descriptors + current values). Degrades to an empty form. */
async function getConfig(slug: string): Promise<ModuleConfigFormView> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/config`
    );
    if (!res.ok) return EMPTY_CONFIG;
    const body = await parseApiResponse<ModuleConfigFormView>(res);
    return body.success ? body.data : EMPTY_CONFIG;
  } catch (err) {
    logger.error('framework module detail: config fetch failed', err);
    return EMPTY_CONFIG;
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
