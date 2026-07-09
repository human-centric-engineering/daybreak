'use client';

/**
 * RosterSearch (f-admin-surfaces t-4) — the shared search box for a module binding-tab picker.
 *
 * Drives a {@link BindingRoster}'s debounced `?q=` re-query so an operator can reach a target
 * past the `ROSTER_LIMIT` cap. Rendered above the picker `<Select>` in each of the Agents /
 * Workflows / Knowledge forms; the hook owns the debounce + request sequencing, this is just
 * the controlled input. Kept visible even on a roster load error so typing can retry the fetch.
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BindingRoster } from '@/components/admin/framework/module-detail/use-binding-roster';

interface RosterSearchProps<T> {
  /** The roster hook this box searches. */
  roster: BindingRoster<T>;
  /** Singular target noun for the label/placeholder ("agent", "workflow", "document"). */
  noun: string;
  /** A stable id for the input↔label association (unique per rendered form). */
  id: string;
}

export function RosterSearch<T>({ roster, noun, id }: RosterSearchProps<T>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Search {noun}s</Label>
      <Input
        id={id}
        type="search"
        value={roster.query}
        onChange={(e) => roster.search(e.target.value)}
        placeholder={`Search ${noun}s by name…`}
        className="w-72"
        aria-busy={roster.loading}
      />
    </div>
  );
}
