import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SlotValuesBrowser } from '@/components/admin/framework/slots/slot-values-browser';
import { Badge } from '@/components/ui/badge';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { SlotDefinitionView, SlotValueHeadView } from '@/lib/framework/data-slots/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Slot · Framework',
  description: 'A slot definition and the values captured against it.',
};

/** How many value heads the browser pre-renders. Past this the "showing first N" hint fires. */
const VALUES_PAGE_LIMIT = 100;

interface SlotDetail {
  definition: SlotDefinitionView;
  values: SlotValueHeadView[];
  total: number;
}

/**
 * The definition (found in the full slot-definitions list — counts are small, so no
 * per-slug endpoint) plus the first, masked page of its captured values. Returns
 * `'not-found'` when no definition declares the slug. A values-fetch failure degrades
 * to an empty page (the browser stays usable), never throwing.
 */
async function getSlotDetail(slug: string): Promise<SlotDetail | 'not-found'> {
  let definition: SlotDefinitionView | undefined;
  try {
    const res = await serverFetch('/api/v1/admin/framework/slot-definitions');
    if (res.ok) {
      const body = await parseApiResponse<SlotDefinitionView[]>(res);
      if (body.success) definition = body.data.find((d) => d.slug === slug);
    }
  } catch (err) {
    logger.error('framework slot detail page: definition fetch failed', err);
  }
  if (!definition) return 'not-found';

  let values: SlotValueHeadView[] = [];
  let total = 0;
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/slot-values?slotSlug=${encodeURIComponent(slug)}&limit=${VALUES_PAGE_LIMIT}`
    );
    if (res.ok) {
      const body = await parseApiResponse<SlotValueHeadView[]>(res);
      if (body.success) {
        values = body.data;
        total = typeof body.meta?.total === 'number' ? body.meta.total : body.data.length;
      }
    }
  } catch (err) {
    logger.error('framework slot detail page: values fetch failed', err);
  }

  return { definition, values, total };
}

export default async function FrameworkSlotDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getSlotDetail(slug);
  if (detail === 'not-found') notFound();

  const { definition, values, total } = detail;

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="font-mono text-2xl font-semibold">{definition.slug}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{definition.description}</p>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Group" value={definition.group} />
        <Field label="Scope" value={definition.scope} mono />
        <Field label="Type" value={definition.dataType} />
        <Field label="Mode" value={definition.mode} />
        <Field label="Visibility" value={definition.visibility} />
        <div>
          <p className="text-muted-foreground text-xs">Sensitivity</p>
          <Badge variant={definition.sensitivity === 'standard' ? 'secondary' : 'outline'}>
            {definition.sensitivity}
          </Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Captured values{' '}
          <FieldHelp title="Captured values" contentClassName="w-96">
            <p>
              The current value the system holds for this slot, per user (the head version — earlier
              versions are superseded, not shown here).
            </p>
            <p className="mt-2">
              Values for a <em>sensitive</em> or <em>special category</em> slot are masked. Use
              &ldquo;Reveal&rdquo; to see a stored value — each reveal is recorded in the audit log.
            </p>
          </FieldHelp>
        </h2>
        <SlotValuesBrowser slotSlug={definition.slug} initialValues={values} total={total} />
      </section>
    </div>
  );
}

/** A labelled read-only definition field. */
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</p>
    </div>
  );
}
