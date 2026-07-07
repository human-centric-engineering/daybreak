'use client';

/**
 * AgentsTab (f-ops-views t-4a) — the module's agent-binding admin surface.
 *
 * Lists the agents bound into the module's seats (primary first), and lets an operator bind
 * an agent into a declared seat, promote a binding to the module's single lead seat, or
 * unbind. Pure UI over 07's shipped `/modules/[slug]/agents[/bindingId]` endpoints; the
 * server owns all validation (a role must be a declared seat, ≤ 1 primary per module, no
 * duplicate agent+seat), and its field errors surface on the form.
 *
 * Built on the shared binding-tab primitives ({@link useBindingRoster} on-demand picker,
 * {@link useRowActions} row-lock/confirm state, {@link RowConfirm}) that the Workflows and
 * Knowledge tabs also use. A per-binding `config` override exists on the model but has no
 * operator-facing consumer yet, so it is intentionally not edited here (deferred).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api/client';
import type {
  ModuleAgentBindingListItem,
  ModuleAgentRolesView,
} from '@/lib/framework/modules/view';
import { apiFieldErrors } from '@/components/admin/framework/module-detail/api-field-errors';
import {
  ROSTER_LIMIT,
  useBindingRoster,
} from '@/components/admin/framework/module-detail/use-binding-roster';
import { useRowActions } from '@/components/admin/framework/module-detail/use-row-actions';
import { RowConfirm } from '@/components/admin/framework/module-detail/row-confirm';

/** The minimal agent fields the bind picker needs from the orchestration roster. */
interface AgentRosterItem {
  id: string;
  name: string;
  slug: string;
}

// `kind=chat` mirrors the agents list page: evaluation *judge* agents are not runtime agents,
// so they must not be offered as bindable module seats.
const ROSTER_URL = `/api/v1/admin/orchestration/agents?isActive=true&kind=chat&limit=${ROSTER_LIMIT}`;

interface AgentsTabProps {
  slug: string;
  /** The declared seats + registration; `null` ⇒ the seats fetch failed (not "unregistered"). */
  agentRoles: ModuleAgentRolesView | null;
  /** The current bindings; `null` ⇒ that fetch failed (not an empty binding set). */
  bindings: ModuleAgentBindingListItem[] | null;
}

export function AgentsTab({ slug, agentRoles, bindings }: AgentsTabProps) {
  const router = useRouter();
  const base = `/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/agents`;

  const roster = useBindingRoster<AgentRosterItem>(ROSTER_URL);
  const rows = useRowActions();

  const [adding, setAdding] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // `null` agentRoles = the seats fetch failed → we can't offer the bind form, but this is a
  // distinct "couldn't load" state, NOT the false "module is unregistered" claim.
  const registered = agentRoles?.registered ?? false;
  const roles = agentRoles?.roles ?? [];
  const canBind = agentRoles !== null && registered && roles.length > 0;

  function openForm() {
    setAdding(true);
    setErrors([]);
    void roster.load();
  }

  async function bind(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || !role) {
      setErrors(['Choose an agent and a seat.']);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      await apiClient.post(base, { body: { agentId, role, isPrimary } });
      setAgentId('');
      setRole('');
      setIsPrimary(false);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setErrors(apiFieldErrors(err, 'Failed to bind agent'));
    } finally {
      setBusy(false);
    }
  }

  function makePrimary(bindingId: string) {
    void rows.run(
      bindingId,
      async () => {
        await apiClient.patch(`${base}/${bindingId}`, { body: { isPrimary: true } });
        router.refresh();
      },
      'Failed to update binding'
    );
  }

  function unbind(bindingId: string) {
    void rows.run(
      bindingId,
      async () => {
        await apiClient.delete(`${base}/${bindingId}`);
        router.refresh();
      },
      'Failed to unbind agent'
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Agents bound into this module&rsquo;s seats. The primary seat is the module&rsquo;s lead
          agent.
        </p>
        {canBind && !adding && (
          <Button size="sm" onClick={openForm}>
            Bind agent
          </Button>
        )}
      </div>

      {agentRoles === null && (
        <p className="text-muted-foreground text-sm" role="alert">
          The module&rsquo;s seats couldn&rsquo;t be loaded, so the bind form is unavailable. Try
          refreshing the page.
        </p>
      )}
      {agentRoles !== null && !registered && (
        <p className="text-muted-foreground text-sm">
          This module&rsquo;s code is not registered, so agents can&rsquo;t be bound. Existing
          bindings are shown for cleanup.
        </p>
      )}
      {agentRoles !== null && registered && roles.length === 0 && (
        <p className="text-muted-foreground text-sm">This module declares no agent seats.</p>
      )}

      {adding && canBind && (
        <form
          onSubmit={(e) => void bind(e)}
          className="bg-muted/40 space-y-4 rounded-md border p-4"
        >
          {roster.error ? (
            <p className="text-destructive text-sm" role="alert">
              {roster.error}
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bind-agent">Agent</Label>
                <Select
                  value={agentId}
                  onValueChange={setAgentId}
                  disabled={roster.roster === null}
                >
                  <SelectTrigger id="bind-agent" className="w-56">
                    <SelectValue
                      placeholder={roster.roster === null ? 'Loading…' : 'Select an agent'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(roster.roster ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bind-role">Seat</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="bind-role" className="w-48">
                    <SelectValue placeholder="Select a seat" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                />
                Primary seat
              </label>
            </div>
          )}

          {roster.capped && !roster.error && (
            <p className="text-muted-foreground text-xs">
              Showing the first {ROSTER_LIMIT} agents. If the one you want isn&rsquo;t listed,
              deactivate unused agents to bring it into range.
            </p>
          )}

          {errors.length > 0 && (
            <ul className="text-destructive space-y-1 text-sm" role="alert">
              {errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || roster.roster === null}>
              {busy ? 'Binding…' : 'Bind'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {rows.error && (
        <p className="text-destructive text-sm" role="alert">
          {rows.error}
        </p>
      )}

      {bindings === null ? (
        <p className="text-muted-foreground text-sm" role="alert">
          The current bindings couldn&rsquo;t be loaded. Try refreshing the page.
        </p>
      ) : bindings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No agents are bound yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="w-40">Seat</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    {b.agent ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{b.agent.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {b.agent.slug}
                        </span>
                        {b.agent.deletedAt && <Badge variant="destructive">Deleted</Badge>}
                        {!b.agent.deletedAt && !b.agent.isActive && (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">Unknown agent (removed)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{b.role}</span>
                      {b.isPrimary && <Badge variant="secondary">Primary</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {rows.confirmingId === b.id ? (
                      <RowConfirm
                        busy={rows.busyId === b.id}
                        anyBusy={rows.busyId !== null}
                        onConfirm={() => unbind(b.id)}
                        onCancel={() => rows.setConfirmingId(null)}
                        busyLabel="Unbinding…"
                      />
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {!b.isPrimary && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => makePrimary(b.id)}
                            disabled={rows.locked}
                          >
                            Make primary
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rows.setConfirmingId(b.id)}
                          disabled={rows.locked}
                        >
                          Unbind
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
