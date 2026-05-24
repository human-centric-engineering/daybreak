import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  TriggerForm,
  type AgentOption,
  type WorkflowOption,
} from '@/components/admin/orchestration/trigger-form';
import { API } from '@/lib/api/endpoints';
import { getBaseUrl, parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'New Inbound Trigger · AI Orchestration',
};

async function getWorkflows(): Promise<WorkflowOption[]> {
  try {
    const res = await serverFetch(`${API.ADMIN.ORCHESTRATION.WORKFLOWS}?page=1&limit=200`);
    if (!res.ok) return [];
    const body = await parseApiResponse<WorkflowOption[]>(res);
    return body.success ? body.data : [];
  } catch (err) {
    logger.error('trigger new: workflows fetch failed', err);
    return [];
  }
}

async function getAgents(): Promise<AgentOption[]> {
  try {
    const res = await serverFetch(`${API.ADMIN.ORCHESTRATION.AGENTS}?page=1&limit=200`);
    if (!res.ok) return [];
    const body = await parseApiResponse<AgentOption[]>(res);
    return body.success ? body.data : [];
  } catch (err) {
    logger.error('trigger new: agents fetch failed', err);
    return [];
  }
}

async function getEnabledChannels(): Promise<string[]> {
  try {
    const res = await serverFetch(`${API.ADMIN.ORCHESTRATION.TRIGGERS}?page=1&limit=1`);
    if (!res.ok) return [];
    const body = await parseApiResponse<unknown>(res);
    if (
      body.success &&
      body.meta &&
      typeof body.meta === 'object' &&
      'enabledChannels' in body.meta
    ) {
      return (body.meta as { enabledChannels: string[] }).enabledChannels ?? [];
    }
    return [];
  } catch {
    return [];
  }
}

export default async function NewTriggerPage() {
  const [workflows, agents, enabledChannels] = await Promise.all([
    getWorkflows(),
    getAgents(),
    getEnabledChannels(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orchestration/triggers"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Triggers
        </Link>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">New trigger</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure how an external system fires a workflow.
        </p>
      </div>

      {workflows.length === 0 ? (
        <div className="bg-card space-y-4 rounded-lg border p-6 text-sm">
          <div>
            <h3 className="font-semibold">You need a workflow first</h3>
            <p className="text-muted-foreground mt-1">
              Every trigger fires exactly one workflow. The trigger holds the webhook URL config
              (channel, signing secret, event filter); the workflow holds the actual logic that runs
              when an inbound message arrives.
            </p>
          </div>

          <div className="text-muted-foreground bg-muted/40 rounded border p-3 text-xs">
            <div className="text-foreground mb-1.5 font-medium">Typical setup</div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Build a workflow under{' '}
                <Link
                  href="/admin/orchestration/workflows"
                  className="text-primary hover:underline"
                >
                  Workflows
                </Link>
                . The simplest shape is a single <code>llm_call</code> step that takes the inbound
                message text from <code>trigger.text</code> and asks an agent to respond.
              </li>
              <li>Publish the workflow (so it has a version triggers can pin to).</li>
              <li>
                Come back here to wire the webhook — pick the workflow + channel, paste the
                generated URL into Twilio / Slack / etc.
              </li>
            </ol>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <Link href="/admin/orchestration/workflows/new">Create a workflow</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/orchestration/triggers">← Back to triggers</Link>
            </Button>
          </div>
        </div>
      ) : (
        <TriggerForm
          mode="create"
          workflows={workflows}
          agents={agents}
          enabledChannels={enabledChannels}
          baseUrl={getBaseUrl()}
        />
      )}
    </div>
  );
}
