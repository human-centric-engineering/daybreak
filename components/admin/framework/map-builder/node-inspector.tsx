'use client';

/**
 * NodeInspector (f-map-editor t-3) — the per-node configuration panel, replacing the
 * read-only selected-node aside t-1 shipped. Edits the fields the map schema carries
 * on a node: its **type** (among the three place kinds), its **module binding**
 * (`moduleSlug`, for `module` nodes), an optional **stage** marker, its **completion
 * mode** (`once` / `repeatable`), and the **first-arrival** workflow / agent.
 *
 * Region nodes are structural containers — their membership is edited by dragging
 * nodes in and out on the canvas (t-2), not here — so the inspector shows a region's
 * identity + delete only.
 *
 * Presentational: it owns no canvas state. Every edit calls `onDataChange(nodeId,
 * patch)`, and the parent `<MapBuilder>` merges the patch into the node's flow data
 * (which the mappers round-trip back to a `MapDefinition` on save).
 */

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldHelp } from '@/components/ui/field-help';
import { cn } from '@/lib/utils';
import { mapNodeKind } from '@/components/admin/framework/map-builder/map-node-kinds';
import type {
  MapFlowNode,
  MapNodeData,
} from '@/components/admin/framework/map-builder/map-mappers';
import { COMPLETION_MODES, type NodeType } from '@/lib/framework/facilitation/map/schema';

export interface NodeInspectorProps {
  node: MapFlowNode;
  /** Registered module slugs — suggestions for the `module` binding field. */
  moduleOptions: readonly string[];
  onDataChange: (nodeId: string, patch: Partial<MapNodeData>) => void;
  onDelete: (nodeId: string) => void;
}

/** The place kinds a node can be retyped between here. `region` is structural (it
 *  carries children + a distinct flow node type), so it is not offered as a target. */
const EDITABLE_NODE_TYPES: NodeType[] = ['module', 'stage', 'milestone'];

const COMPLETION_MODE_LABELS: Record<(typeof COMPLETION_MODES)[number], string> = {
  once: 'Once — closes when completed',
  repeatable: 'Repeatable — reopens after completion',
};

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none';

const PANEL_CLASS =
  'bg-background flex h-full w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4';

export function NodeInspector({ node, moduleOptions, onDataChange, onDelete }: NodeInspectorProps) {
  const data = node.data;
  const kind = mapNodeKind(data.nodeType);
  const isRegion = data.nodeType === 'region';

  // Retyping to a non-module kind drops the now-meaningless module binding in the same
  // patch, so a stage/milestone never carries a stale `moduleSlug` into the snapshot.
  const changeType = (nodeType: NodeType) => {
    onDataChange(node.id, {
      nodeType,
      ...(nodeType === 'module' ? {} : { moduleSlug: undefined }),
    });
  };

  // Merge one first-arrival field, normalising blanks: an all-blank object collapses
  // to `undefined` so the node carries no `onFirstArrival` key at all.
  const changeArrival = (patch: { workflowSlug?: string; agentSlug?: string }) => {
    const merged = { ...data.onFirstArrival, ...patch };
    const workflowSlug = merged.workflowSlug?.trim() ? merged.workflowSlug.trim() : undefined;
    const agentSlug = merged.agentSlug?.trim() ? merged.agentSlug.trim() : undefined;
    onDataChange(node.id, {
      onFirstArrival:
        workflowSlug || agentSlug
          ? { ...(workflowSlug ? { workflowSlug } : {}), ...(agentSlug ? { agentSlug } : {}) }
          : undefined,
    });
  };

  const header = (
    <div>
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {kind.label}
      </p>
      <p className="mt-0.5 font-mono text-sm font-medium break-all">{data.label}</p>
    </div>
  );

  const deleteButton = (
    <Button
      variant="outline"
      size="sm"
      className="mt-auto text-red-600 hover:text-red-700 dark:text-red-400"
      onClick={() => onDelete(node.id)}
    >
      <Trash2 className="mr-1.5 h-4 w-4" /> Delete {isRegion ? 'region' : 'node'}
    </Button>
  );

  if (isRegion) {
    return (
      <aside data-testid="map-node-panel" className={PANEL_CLASS}>
        {header}
        <p className="text-muted-foreground text-xs leading-relaxed">
          A region groups member nodes. Drag nodes into or out of it on the canvas to change its
          membership, and use its header to collapse or expand it.
        </p>
        {deleteButton}
      </aside>
    );
  }

  const missingBinding = data.nodeType === 'module' && !data.moduleSlug;

  return (
    <aside data-testid="map-node-panel" className={PANEL_CLASS}>
      {header}

      <div>
        <Label htmlFor="node-type" className="text-xs">
          Node type{' '}
          <FieldHelp title="Node type">
            <p>
              What this place is: a <strong>module</strong> (bound to a registered module — where a
              user does the work), a <strong>stage</strong> (a maturity marker), or a{' '}
              <strong>milestone</strong> (a one-off achievement other nodes can gate on).
            </p>
          </FieldHelp>
        </Label>
        <select
          id="node-type"
          data-testid="node-type"
          className={cn(SELECT_CLASS, 'mt-1')}
          value={data.nodeType}
          onChange={(e) => changeType(e.target.value as NodeType)}
        >
          {EDITABLE_NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {mapNodeKind(t).label}
            </option>
          ))}
        </select>
      </div>

      {data.nodeType === 'module' && (
        <div>
          <Label htmlFor="node-module" className="text-xs">
            Module binding{' '}
            <FieldHelp title="Module binding">
              <p>
                The registered module this place runs. Required for a module node — the engine sends
                the user into this module on arrival.
              </p>
            </FieldHelp>
          </Label>
          <Input
            id="node-module"
            list="node-module-options"
            data-testid="node-module"
            className="mt-1 h-9"
            value={data.moduleSlug ?? ''}
            placeholder="module-slug"
            onChange={(e) =>
              onDataChange(node.id, { moduleSlug: e.target.value.trim() || undefined })
            }
          />
          <datalist id="node-module-options">
            {moduleOptions.map((slug) => (
              <option key={slug} value={slug} />
            ))}
          </datalist>
          {missingBinding && (
            <p
              data-testid="node-module-missing"
              className="mt-1 text-[11px] leading-snug text-amber-700 dark:text-amber-300"
            >
              A module node needs a binding before the map can publish.
            </p>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="node-stage" className="text-xs">
          Stage{' '}
          <FieldHelp title="Stage">
            <p>
              An optional maturity level this node belongs to — a free-form marker the map can group
              and gate on. Leave blank if unused.
            </p>
          </FieldHelp>
        </Label>
        <Input
          id="node-stage"
          data-testid="node-stage"
          className="mt-1 h-9"
          value={data.stage ?? ''}
          placeholder="optional"
          onChange={(e) => onDataChange(node.id, { stage: e.target.value.trim() || undefined })}
        />
      </div>

      <div>
        <Label htmlFor="node-completion" className="text-xs">
          Completion mode{' '}
          <FieldHelp title="Completion mode">
            <p>
              Whether this place closes for good once completed (<code>once</code>) or reopens so a
              user can return (<code>repeatable</code>). Default: <code>once</code>.
            </p>
          </FieldHelp>
        </Label>
        <select
          id="node-completion"
          data-testid="node-completion"
          className={cn(SELECT_CLASS, 'mt-1')}
          value={data.completionMode}
          onChange={(e) =>
            onDataChange(node.id, {
              completionMode: e.target.value as MapNodeData['completionMode'],
            })
          }
        >
          {COMPLETION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {COMPLETION_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs">
          On first arrival{' '}
          <FieldHelp title="On first arrival">
            <p>
              A one-time welcome when a user first reaches this place: an optional workflow and/or
              agent to run. Leave blank for no arrival behaviour.
            </p>
          </FieldHelp>
        </Label>
        <Input
          id="node-arrival-workflow"
          data-testid="node-arrival-workflow"
          className="h-9"
          value={data.onFirstArrival?.workflowSlug ?? ''}
          placeholder="workflow slug (optional)"
          onChange={(e) => changeArrival({ workflowSlug: e.target.value })}
        />
        <Input
          id="node-arrival-agent"
          data-testid="node-arrival-agent"
          className="h-9"
          value={data.onFirstArrival?.agentSlug ?? ''}
          placeholder="agent slug (optional)"
          onChange={(e) => changeArrival({ agentSlug: e.target.value })}
        />
      </div>

      {deleteButton}
    </aside>
  );
}
