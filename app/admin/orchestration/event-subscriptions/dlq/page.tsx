import type { Metadata } from 'next';
import Link from 'next/link';

import { WebhookDlqTable } from '@/components/admin/orchestration/webhook-dlq-table';
import { FieldHelp } from '@/components/ui/field-help';
import { API } from '@/lib/api/endpoints';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { parsePaginationMeta } from '@/lib/validations/common';
import { logger } from '@/lib/logging';
import type { PaginationMeta } from '@/types/api';

export const metadata: Metadata = {
  title: 'Dead Letter Queue · Event Subscriptions',
  description: 'Exhausted webhook deliveries across all subscriptions.',
};

interface DlqDelivery {
  id: string;
  eventType: string;
  status: 'exhausted';
  lastResponseCode: number | null;
  lastError: string | null;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  subscriptionId: string;
  subscription: { id: string; url: string; description: string | null };
}

interface WebhookListItem {
  id: string;
  url: string;
  description: string | null;
}

const EMPTY_META: PaginationMeta = { page: 1, limit: 20, total: 0, totalPages: 1 };

async function getDlq(): Promise<{ deliveries: DlqDelivery[]; meta: PaginationMeta }> {
  try {
    const res = await serverFetch(`${API.ADMIN.ORCHESTRATION.WEBHOOK_DLQ}?page=1&pageSize=20`);
    if (!res.ok) return { deliveries: [], meta: EMPTY_META };
    const body = await parseApiResponse<DlqDelivery[]>(res);
    if (!body.success) return { deliveries: [], meta: EMPTY_META };
    return {
      deliveries: body.data,
      meta: parsePaginationMeta(body.meta) ?? EMPTY_META,
    };
  } catch (err) {
    logger.error('dlq page: initial fetch failed', err);
    return { deliveries: [], meta: EMPTY_META };
  }
}

async function getSubscriptions(): Promise<WebhookListItem[]> {
  try {
    const res = await serverFetch(`${API.ADMIN.ORCHESTRATION.WEBHOOKS}?page=1&limit=100`);
    if (!res.ok) return [];
    const body = await parseApiResponse<WebhookListItem[]>(res);
    return body.success ? body.data : [];
  } catch (err) {
    logger.error('dlq page: subscription fetch failed', err);
    return [];
  }
}

export default async function WebhookDlqPage() {
  const [{ deliveries, meta }, subscriptions] = await Promise.all([getDlq(), getSubscriptions()]);

  return (
    <div className="space-y-6">
      <header>
        <nav className="text-muted-foreground mb-1 text-xs">
          <Link href="/admin/orchestration" className="hover:underline">
            AI Orchestration
          </Link>
          {' / '}
          <Link href="/admin/orchestration/event-subscriptions" className="hover:underline">
            Event Subscriptions
          </Link>
          {' / '}
          <span>Dead Letter Queue</span>
        </nav>
        <h1 className="text-2xl font-semibold">
          Dead Letter Queue{' '}
          <FieldHelp title="What lands here" contentClassName="w-96">
            <p>
              When a webhook delivery fails enough times to hit the subscription&apos;s{' '}
              <code>maxAttempts</code> limit, Sunrise stops retrying and parks it here. Nothing is
              dropped — the row stays until you retry it, discard it, or the retention sweep removes
              it.
            </p>
            <p className="text-foreground mt-2 font-medium">Common actions</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                <span className="font-medium">Retry</span> — re-dispatch a single delivery once
                you&apos;ve fixed the receiver.
              </li>
              <li>
                <span className="font-medium">Discard</span> — delete a delivery you&apos;ve already
                reviewed and don&apos;t need to keep.
              </li>
            </ul>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Exhausted webhook deliveries across all subscriptions you own.
        </p>
      </header>

      <WebhookDlqTable
        initialDeliveries={deliveries}
        initialMeta={meta}
        subscriptions={subscriptions}
      />
    </div>
  );
}
