import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ModuleDetail } from '@/components/admin/framework/module-detail/module-detail';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type {
  ModuleConfigFormView,
  ModuleSettingsView,
  ModuleVersionsView,
} from '@/lib/framework/modules/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Module · Framework',
  description: 'Configure a framework module and review its config history.',
};

const EMPTY_VERSIONS: ModuleVersionsView = { versions: [], nextCursor: null };

/**
 * The module's operator settings (identity + lifecycle window), read via the single-module
 * `GET /modules/[slug]` that t-3 added with the lifecycle writes. Returns `null` when the
 * module doesn't exist (the endpoint 404s) → the page 404s. This shape backs both the header
 * and the Settings tab's form.
 */
async function getIdentity(slug: string): Promise<ModuleSettingsView | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/framework/modules/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const body = await parseApiResponse<ModuleSettingsView>(res);
    return body.success ? body.data : null;
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
 * Thin server component: fetches the module's settings, config form, and version list in
 * parallel, then hands them to the `<ModuleDetail>` tabbed shell (Settings + Config +
 * Versions tabs; t-4 appends the binding tabs). 404s when the module doesn't exist; the
 * config/versions fetches degrade to empty state rather than throwing (the list-page
 * precedent) — only a missing identity 404s.
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
