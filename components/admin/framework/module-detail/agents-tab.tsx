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
 * This is the reusable "binding tab" shape the Workflows / Knowledge tabs (t-4b / t-4c)
 * mirror: a stitched read table (with a degraded row when the bound entity was removed) over
 * the list endpoint + an inline create form whose picker roster is fetched on demand.
 *
 * A per-binding `config` override exists on the model but has no operator-facing consumer
 * yet, so it is intentionally not edited here (deferred, not forgotten).
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
import { apiClient, APIClientError } from '@/lib/api/client';
import type {
  ModuleAgentBindingListItem,
  ModuleAgentRolesView,
} from '@/lib/framework/modules/view';
import { apiFieldErrors } from '@/components/admin/framework/module-detail/api-field-errors';

/** The minimal agent fields the bind picker needs from the orchestration roster. */
interface AgentRosterItem {
  id: string;
  name: string;
  slug: string;
}

/** The roster is capped at the roster endpoint's max page size; see the picker note below. */
const ROSTER_LIMIT = 100;

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

  const [adding, setAdding] = useState(false);
  const [roster, setRoster] = useState<AgentRosterItem[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [confirmingUnbind, setConfirmingUnbind] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // `null` agentRoles = the seats fetch failed → we can't offer the bind form, but this is a
  // distinct "couldn't load" state, NOT the false "module is unregistered" claim.
  const registered = agentRoles?.registered ?? false;
  const roles = agentRoles?.roles ?? [];
  const canBind = agentRoles !== null && registered && roles.length > 0;
  // The picker shows only the first ROSTER_LIMIT agents (the roster endpoint's max page size);
  // flag the likely-truncated case rather than silently hiding agents past the cap.
  const rosterCapped = roster !== null && roster.length >= ROSTER_LIMIT;
  // Lock every row's actions while any row is busy OR a confirm is open elsewhere, so a
  // confirm can't be interleaved with another row's action into two concurrent mutations.
  const rowLocked = rowBusy !== null || confirmingUnbind !== null;

  async function openForm() {
    setAdding(true);
    setErrors([]);
    // Serialise the roster fetch: only fetch once, and never start a second while one is in
    // flight — a late-arriving response (e.g. open → cancel → reopen) must not overwrite a
    // newer one and leave a stale error over a populated roster.
    if (roster !== null || rosterLoading) return;
    setRosterError(null);
    setRosterLoading(true);
    try {
      // `kind=chat` mirrors the agents list page: evaluation *judge* agents are not runtime
      // agents, so they must not be offered as bindable module seats.
      const agents = await apiClient.get<AgentRosterItem[]>(
        `/api/v1/admin/orchestration/agents?isActive=true&kind=chat&limit=${ROSTER_LIMIT}`
      );
      setRoster(agents);
    } catch (err) {
      setRosterError(err instanceof APIClientError ? err.message : 'Failed to load agents');
    } finally {
      setRosterLoading(false);
    }
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

  async function makePrimary(bindingId: string) {
    setRowBusy(bindingId);
    setRowError(null);
    try {
      await apiClient.patch(`${base}/${bindingId}`, { body: { isPrimary: true } });
      router.refresh();
    } catch (err) {
      setRowError(err instanceof APIClientError ? err.message : 'Failed to update binding');
    } finally {
      setRowBusy(null);
    }
  }

  async function unbind(bindingId: string) {
    setRowBusy(bindingId);
    setRowError(null);
    try {
      await apiClient.delete(`${base}/${bindingId}`);
      setConfirmingUnbind(null);
      router.refresh();
    } catch (err) {
      setRowError(err instanceof APIClientError ? err.message : 'Failed to unbind agent');
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Agents bound into this module&rsquo;s seats. The primary seat is the module&rsquo;s lead
          agent.
        </p>
        {canBind && !adding && (
          <Button size="sm" onClick={() => void openForm()}>
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
          {rosterError ? (
            <p className="text-destructive text-sm" role="alert">
              {rosterError}
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bind-agent">Agent</Label>
                <Select value={agentId} onValueChange={setAgentId} disabled={roster === null}>
                  <SelectTrigger id="bind-agent" className="w-56">
                    <SelectValue placeholder={roster === null ? 'Loading…' : 'Select an agent'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(roster ?? []).map((a) => (
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

          {rosterCapped && !rosterError && (
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
            <Button type="submit" size="sm" disabled={busy || roster === null}>
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

      {rowError && (
        <p className="text-destructive text-sm" role="alert">
          {rowError}
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
                    {confirmingUnbind === b.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void unbind(b.id)}
                          disabled={rowBusy !== null}
                        >
                          {rowBusy === b.id ? 'Unbinding…' : 'Confirm'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmingUnbind(null)}
                          disabled={rowBusy !== null}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {!b.isPrimary && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void makePrimary(b.id)}
                            disabled={rowLocked}
                          >
                            Make primary
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRowError(null);
                            setConfirmingUnbind(b.id);
                          }}
                          disabled={rowLocked}
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
