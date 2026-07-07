/**
 * ModuleDetail (f-ops-views t-2).
 *
 * The tabbed shell for a single framework module: a header (identity + lifecycle status)
 * over a tab set. t-2 ships the **Config** and **Versions** tabs (UI over 06's shipped
 * config/version API); t-3 appends the **Settings** tab (lifecycle writes + danger-zone
 * delete). The `tabs` array is the extension point t-4 (Agents / Workflows / Knowledge
 * bindings) appends further entries to — the host-first pattern.
 *
 * A composition-only server component (no client hooks) — it renders the client tabs and
 * passes them server-fetched props.
 *
 * The Config tab is keyed on the **config content** (a serialisation of the current
 * values), so a save or restore that changes the live config re-initialises the form from
 * the fresh server data after `router.refresh()`. Keying on the config itself (rather than
 * the version number from the separate versions fetch) keeps the form's freshness from
 * depending on the versions endpoint's availability.
 */

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  ModuleAgentBindingListItem,
  ModuleAgentRolesView,
  ModuleConfigFormView,
  ModuleSettingsView,
  ModuleVersionsView,
} from '@/lib/framework/modules/view';
import { ConfigTab } from '@/components/admin/framework/module-detail/config-tab';
import { VersionsTab } from '@/components/admin/framework/module-detail/versions-tab';
import { SettingsTab } from '@/components/admin/framework/module-detail/settings-tab';
import { AgentsTab } from '@/components/admin/framework/module-detail/agents-tab';

// Mirrors `modules-table.tsx`'s statusVariant (2 uses — the Settings tab renders its status
// as an editable Select, not a badge, so this stays at 2; extract to a shared
// <ModuleStatusBadge> on the 3rd badge use).
function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'retired':
      return 'outline';
    default:
      return 'secondary';
  }
}

interface ModuleDetailProps {
  slug: string;
  /** The module's operator settings (identity + lifecycle window), read via `/modules/[slug]`. */
  identity: ModuleSettingsView;
  /** null when the config fetch failed (distinct from a genuinely unregistered module). */
  config: ModuleConfigFormView | null;
  versions: ModuleVersionsView;
  /** The module's agent bindings (07's shipped list), stitched with agent display fields. */
  agentBindings: ModuleAgentBindingListItem[];
  /** The bindable seats the module declares + whether its code is registered. */
  agentRoles: ModuleAgentRolesView;
}

export function ModuleDetail({
  slug,
  identity,
  config,
  versions,
  agentBindings,
  agentRoles,
}: ModuleDetailProps) {
  // Newest version is always the live config (no draft/published split); 0 before any save.
  const currentVersion = versions.versions[0]?.version ?? 0;
  // Re-key the Config tab on its own data, so a save/restore re-initialises the form after
  // `router.refresh()` regardless of whether the versions fetch succeeded.
  const configKey = config ? JSON.stringify(config.values) : 'unavailable';
  // Re-key the Settings tab on its editable content, so a settings save re-initialises the
  // form from the fresh row after `router.refresh()` (same pattern as the Config tab). It
  // deliberately EXCLUDES `updatedAt` — otherwise a save on another tab (e.g. a config save,
  // which also bumps `updatedAt`) would remount the Settings tab and discard its in-progress
  // edits.
  const { updatedAt: _settingsUpdatedAt, ...settingsContent } = identity;
  const settingsKey = JSON.stringify(settingsContent);

  const tabs = [
    {
      value: 'config',
      label: 'Config',
      node: <ConfigTab key={configKey} slug={slug} form={config} />,
    },
    {
      value: 'versions',
      label: 'Versions',
      node: (
        <VersionsTab slug={slug} versions={versions.versions} currentVersion={currentVersion} />
      ),
    },
    {
      value: 'settings',
      label: 'Settings',
      node: <SettingsTab key={settingsKey} settings={identity} />,
    },
    {
      value: 'agents',
      label: 'Agents',
      node: (
        <AgentsTab
          slug={slug}
          registered={agentRoles.registered}
          roles={agentRoles.roles}
          bindings={agentBindings}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/admin/framework/modules" className="hover:underline">
          Framework
        </Link>
        {' / '}
        <Link href="/admin/framework/modules" className="hover:underline">
          Modules
        </Link>
        {' / '}
        <span>{identity.name}</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{identity.name}</h1>
          <Badge variant={statusVariant(identity.status)}>{identity.status}</Badge>
          {!identity.isRegistered && <Badge variant="outline">Unregistered</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">
          <span className="font-mono">{identity.slug}</span>
          {' · '}
          Audience: {identity.audience}
        </p>
      </header>

      <Tabs defaultValue="config">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-4">
            {t.node}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
