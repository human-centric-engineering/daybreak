'use client';

/**
 * SettingsTab (f-ops-views t-3) — the module lifecycle form + danger zone.
 *
 * Edits the operator-controlled columns that drive liveness (`isModuleLive` = status ×
 * flag × window): display name, lifecycle status, audience, an optional feature-flag
 * binding, and the availability window. Submitting PATCHes `/modules/[slug]`; the server
 * re-checks window coherence and audits the change. `router.refresh()` re-fetches the page,
 * and the parent re-keys this tab on the fresh settings so the form reflects the saved row.
 *
 * Danger zone: an UNREGISTERED module (its code is gone) can be hard-deleted — a two-step
 * confirm → DELETE → back to the list. A registered module shows why it can't be deleted
 * (retire it, or remove its code first); the server enforces the same rule with a 409.
 *
 * Window bounds are edited in **UTC** (the `datetime-local` value is read/written as the
 * ISO string's `YYYY-MM-DDTHH:mm` head), matching the version list's UTC rendering and
 * keeping the control deterministic (no server/client timezone skew, no hydration drift).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldHelp } from '@/components/ui/field-help';
import { apiClient, APIClientError } from '@/lib/api/client';
import { MODULE_STATUS } from '@/lib/framework/modules/status';
import type { ModuleSettingsView } from '@/lib/framework/modules/view';

/** ISO string → the `datetime-local` value (`YYYY-MM-DDTHH:mm`, UTC); null → empty. */
function isoToLocal(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

/**
 * A `datetime-local` value (read as UTC) → a full ISO string; empty → null. The control only
 * ever yields a valid `YYYY-MM-DDTHH:mm` head or an empty string, and the server re-validates
 * the ISO string, so no defensive parse guard is needed here.
 */
function localToIso(local: string): string | null {
  const trimmed = local.trim();
  return trimmed === '' ? null : new Date(`${trimmed}Z`).toISOString();
}

/** Trim to a value or null (an empty text field clears an optional column). */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface SettingsTabProps {
  settings: ModuleSettingsView;
}

export function SettingsTab({ settings }: SettingsTabProps) {
  const router = useRouter();
  const slug = settings.slug;

  const [name, setName] = useState(settings.name);
  const [status, setStatus] = useState(settings.status);
  const [audience, setAudience] = useState(settings.audience);
  const [featureFlagName, setFeatureFlagName] = useState(settings.featureFlagName ?? '');
  const [availableFrom, setAvailableFrom] = useState(isoToLocal(settings.availableFrom));
  const [availableUntil, setAvailableUntil] = useState(isoToLocal(settings.availableUntil));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // A fork may carry a status outside the code vocabulary — keep the current value
  // selectable rather than dropping it silently.
  const statusOptions = Array.from(new Set([...Object.values(MODULE_STATUS), status]));

  function markDirty() {
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Send the ORIGINAL ISO for a window bound the operator didn't touch — the
    // `datetime-local` control is minute-precision, so round-tripping an untouched bound
    // through isoToLocal→localToIso would drop its seconds, silently shifting the stored
    // value and recording a spurious audit change on an unrelated save. A bound is
    // "untouched" iff its current input still equals the initial rendering of the row.
    const from =
      availableFrom === isoToLocal(settings.availableFrom)
        ? settings.availableFrom
        : localToIso(availableFrom);
    const until =
      availableUntil === isoToLocal(settings.availableUntil)
        ? settings.availableUntil
        : localToIso(availableUntil);
    if (from && until && new Date(from) > new Date(until)) {
      setErrors(['Availability window: the end must be on or after the start.']);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      await apiClient.patch(`/api/v1/admin/framework/modules/${encodeURIComponent(slug)}`, {
        body: {
          name: name.trim(),
          status,
          audience: audience.trim(),
          featureFlagName: orNull(featureFlagName),
          availableFrom: from,
          availableUntil: until,
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      const detail =
        err instanceof APIClientError && err.details
          ? Object.values(err.details)
              .flat()
              .filter((m): m is string => typeof m === 'string')
          : [];
      setErrors(
        detail.length > 0
          ? detail
          : [err instanceof Error ? err.message : 'Failed to save settings']
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete(`/api/v1/admin/framework/modules/${encodeURIComponent(slug)}`);
      router.push('/admin/framework/modules');
    } catch (err) {
      setDeleteError(err instanceof APIClientError ? err.message : 'Failed to delete module');
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="module-name">Name</Label>
          <Input
            id="module-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            maxLength={200}
            required
            className="max-w-md"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="module-status">Status</Label>
            <FieldHelp title="Status">
              The lifecycle stage. Only <strong>active</strong> can be live — and only then if its
              feature flag (if any) is on and the current time is inside the availability window.{' '}
              <strong>draft</strong>, <strong>scheduled</strong>, and <strong>retired</strong> are
              never live.
            </FieldHelp>
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              markDirty();
            }}
          >
            <SelectTrigger id="module-status" className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="module-audience">Audience</Label>
            <FieldHelp title="Audience">
              Who the module is offered to (e.g. <code>all</code>, <code>invite</code>,{' '}
              <code>flag-gated</code>). Free-form — the facilitation layer interprets it; it does
              not affect the liveness switch.
            </FieldHelp>
          </div>
          <Input
            id="module-audience"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value);
              markDirty();
            }}
            maxLength={50}
            required
            className="max-w-xs"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="module-flag">Feature flag</Label>
            <FieldHelp title="Feature flag">
              Optional. Bind the module to a feature flag so an <strong>active</strong> module is
              only live while that flag is on. Leave blank to unbind (no flag gating).
            </FieldHelp>
          </div>
          <Input
            id="module-flag"
            value={featureFlagName}
            onChange={(e) => {
              setFeatureFlagName(e.target.value);
              markDirty();
            }}
            maxLength={200}
            placeholder="(none)"
            className="max-w-md"
          />
        </div>

        <div className="flex flex-wrap gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="module-from">Available from (UTC)</Label>
              <FieldHelp title="Available from">
                Optional window start, in UTC. Before this instant an <strong>active</strong> module
                is not live. Leave blank for open-ended.
              </FieldHelp>
            </div>
            <Input
              id="module-from"
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => {
                setAvailableFrom(e.target.value);
                markDirty();
              }}
              className="max-w-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="module-until">Available until (UTC)</Label>
              <FieldHelp title="Available until">
                Optional window end, in UTC. After this instant an <strong>active</strong> module is
                not live. Leave blank for open-ended.
              </FieldHelp>
            </div>
            <Input
              id="module-until"
              type="datetime-local"
              value={availableUntil}
              onChange={(e) => {
                setAvailableUntil(e.target.value);
                markDirty();
              }}
              className="max-w-xs"
            />
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="text-destructive space-y-1 text-sm" role="alert">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
          {saved && <span className="text-muted-foreground text-sm">Saved.</span>}
        </div>
      </form>

      <section className="border-destructive/40 space-y-3 rounded-md border border-dashed p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Danger zone</h2>
          <Badge variant="outline">Delete</Badge>
        </div>

        {settings.isRegistered ? (
          <p className="text-muted-foreground text-sm">
            This module&rsquo;s code is still registered, so it can&rsquo;t be deleted (boot would
            recreate the row). To take it offline, set its status to <strong>retired</strong>. To
            remove it entirely, delete its code first — that unregisters the row, and it can be
            deleted here.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              This module is unregistered (its code is gone). Deleting it permanently removes the
              row and its config history, agent bindings, and knowledge scope. This cannot be
              undone.
            </p>
            {deleteError && (
              <p className="text-destructive text-sm" role="alert">
                {deleteError}
              </p>
            )}
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmingDelete(true);
                }}
              >
                Delete module
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
