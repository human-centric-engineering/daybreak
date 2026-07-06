'use client';

/**
 * ModuleDetail (f-ops-views t-2).
 *
 * The tabbed shell for a single framework module: a header (identity + lifecycle status)
 * over a tab set. t-2 ships the **Config** and **Versions** tabs (UI over 06's shipped
 * config/version API); the `tabs` array is the extension point t-3 (Settings) and t-4
 * (Agents / Workflows / Knowledge bindings) append entries to — the host-first pattern.
 *
 * The Config tab is keyed on the current live version number, so a save or restore (which
 * bumps that number and, for a restore, rewrites the live config) re-initialises the form
 * from the fresh server data after `router.refresh()`.
 */

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  ModuleConfigFormView,
  ModuleListItem,
  ModuleVersionsView,
} from '@/lib/framework/modules/view';
import { ConfigTab } from '@/components/admin/framework/module-detail/config-tab';
import { VersionsTab } from '@/components/admin/framework/module-detail/versions-tab';

// Mirrors `modules-table.tsx`'s statusVariant (2 uses — extract to a shared
// <ModuleStatusBadge> on the 3rd, which t-3's Settings tab will add).
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
  identity: ModuleListItem;
  config: ModuleConfigFormView;
  versions: ModuleVersionsView;
}

export function ModuleDetail({ slug, identity, config, versions }: ModuleDetailProps) {
  // Newest version is always the live config (no draft/published split); 0 before any save.
  const currentVersion = versions.versions[0]?.version ?? 0;

  const tabs = [
    {
      value: 'config',
      label: 'Config',
      node: <ConfigTab key={currentVersion} slug={slug} form={config} />,
    },
    {
      value: 'versions',
      label: 'Versions',
      node: (
        <VersionsTab slug={slug} versions={versions.versions} currentVersion={currentVersion} />
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
