import type { Metadata } from 'next';
import type { Module } from '@prisma/client';

import { ModulesTable } from '@/components/admin/framework/modules-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Modules · Framework',
  description: 'Registered framework modules — their config, bindings, and lifecycle.',
};

/**
 * Admin — Framework Modules list (f-ops-views t-1).
 *
 * The FIRST framework admin page: a thin server component that pre-renders the
 * module list via `serverFetch(GET /modules)` and hands it to the client
 * `<ModulesTable>`. Framework-tier per the X6 boundary (`app/admin/framework/**`
 * is in the framework ESLint block). A fetch failure never throws — the table
 * renders an empty state so the page stays usable (the `capabilities` page
 * precedent).
 */
async function getModules(): Promise<Module[]> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/modules');
    if (!res.ok) return [];
    const body = await parseApiResponse<Module[]>(res);
    if (!body.success) return [];
    return body.data;
  } catch (err) {
    logger.error('framework modules list page: initial fetch failed', err);
    return [];
  }
}

export default async function FrameworkModulesPage() {
  const modules = await getModules();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">
          Modules{' '}
          <FieldHelp title="What are modules?" contentClassName="w-96">
            <p>
              A <strong>module</strong> is a registered, bounded feature unit — defined in code,
              with operator-controlled settings stored here. Agents, workflows, and knowledge attach
              to a module by <em>binding</em>, never ownership.
            </p>
            <p className="mt-2">
              This list shows every module the running code has registered. Open one to edit its
              configuration, manage its bindings, and control its lifecycle.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registered feature units and their operator settings.
        </p>
      </header>

      <ModulesTable initialModules={modules} />
    </div>
  );
}
