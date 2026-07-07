import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ModuleDetail } from '@/components/admin/framework/module-detail/module-detail';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type {
  ModuleAgentBindingListItem,
  ModuleAgentRolesView,
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
const EMPTY_AGENT_ROLES: ModuleAgentRolesView = { registered: false, roles: [] };

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

/** The module's agent bindings (07's list). Degrades to an empty list. */
async function getAgentBindings(slug: string): Promise<ModuleAgentBindingListItem[]> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/agents`
    );
    if (!res.ok) return [];
    const body = await parseApiResponse<ModuleAgentBindingListItem[]>(res);
    return body.success ? body.data : [];
  } catch (err) {
    logger.error('framework module detail: agent bindings fetch failed', err);
    return [];
  }
}

/** The bindable seats the module declares. Degrades to "unregistered, no seats". */
async function getAgentRoles(slug: string): Promise<ModuleAgentRolesView> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/agent-roles`
    );
    if (!res.ok) return EMPTY_AGENT_ROLES;
    const body = await parseApiResponse<ModuleAgentRolesView>(res);
    return body.success ? body.data : EMPTY_AGENT_ROLES;
  } catch (err) {
    logger.error('framework module detail: agent roles fetch failed', err);
    return EMPTY_AGENT_ROLES;
  }
}

/**
 * Admin — Framework Module detail (f-ops-views t-2 / t-4a).
 *
 * Thin server component: fetches the module's settings, config form, version list, and agent
 * bindings + declared seats in parallel, then hands them to the `<ModuleDetail>` tabbed shell
 * (Config + Versions + Settings + Agents tabs; t-4b/t-4c append Workflows / Knowledge). 404s
 * when the module doesn't exist; the non-identity fetches degrade to empty state rather than
 * throwing (the list-page precedent) — only a missing identity 404s.
 */
export default async function FrameworkModuleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [identity, config, versions, agentBindings, agentRoles] = await Promise.all([
    getIdentity(slug),
    getConfig(slug),
    getVersions(slug),
    getAgentBindings(slug),
    getAgentRoles(slug),
  ]);

  if (!identity) notFound();

  return (
    <ModuleDetail
      slug={slug}
      identity={identity}
      config={config}
      versions={versions}
      agentBindings={agentBindings}
      agentRoles={agentRoles}
    />
  );
}
