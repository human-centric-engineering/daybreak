/**
 * NodeInspector (f-map-editor t-3) — the per-node config panel. Proves each field edit
 * calls `onDataChange` with the right patch (type retype drops the module binding,
 * first-arrival collapses blanks), the missing-binding hint shows for an unbound module
 * node, a region shows its structural note only, and delete fires.
 *
 * @see components/admin/framework/map-builder/node-inspector.tsx
 */

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NodeInspector } from '@/components/admin/framework/map-builder/node-inspector';
import type { MapNodeData } from '@/components/admin/framework/map-builder/map-mappers';

/**
 * A stateful harness that reflects each patch back into the node's data — as the real
 * `<MapBuilder>` does — so controlled inputs accumulate typed text across keystrokes.
 * The `onDataChange` spy still records every patch for assertions.
 */
function Harness({
  initial,
  onDataChange,
  onDelete,
}: {
  initial: MapNodeData;
  onDataChange: (id: string, patch: Partial<MapNodeData>) => void;
  onDelete: (id: string) => void;
}) {
  const [data, setData] = useState<MapNodeData>(initial);
  return (
    <NodeInspector
      node={{
        id: 'n1',
        type: data.nodeType === 'region' ? 'region' : 'map',
        position: { x: 0, y: 0 },
        data,
      }}
      moduleOptions={['coach', 'reflect']}
      onDataChange={(id, patch) => {
        onDataChange(id, patch);
        setData((d) => ({ ...d, ...patch }));
      }}
      onDelete={onDelete}
    />
  );
}

function renderInspector(over: Partial<MapNodeData> = {}) {
  const onDataChange = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(
    <Harness
      initial={{ label: 'n1', nodeType: 'module', completionMode: 'once', ...over }}
      onDataChange={onDataChange}
      onDelete={onDelete}
    />
  );
  return { onDataChange, onDelete, user };
}

describe('NodeInspector', () => {
  it('shows the node kind label and key', () => {
    renderInspector({ moduleSlug: 'coach' });
    const panel = screen.getByTestId('map-node-panel');
    expect(panel).toHaveTextContent('Module');
    expect(panel).toHaveTextContent('n1');
  });

  it('retypes the node and drops the module binding', async () => {
    const { onDataChange, user } = renderInspector({ moduleSlug: 'coach' });
    await user.selectOptions(screen.getByTestId('node-type'), 'stage');
    expect(onDataChange).toHaveBeenCalledWith('n1', { nodeType: 'stage', moduleSlug: undefined });
  });

  it('edits the module binding', async () => {
    const { onDataChange, user } = renderInspector();
    await user.type(screen.getByTestId('node-module'), 'coach');
    expect(onDataChange).toHaveBeenLastCalledWith('n1', { moduleSlug: 'coach' });
  });

  it('warns when a module node has no binding', () => {
    renderInspector();
    expect(screen.getByTestId('node-module-missing')).toBeInTheDocument();
  });

  it('does not warn once the module node is bound', () => {
    renderInspector({ moduleSlug: 'coach' });
    expect(screen.queryByTestId('node-module-missing')).not.toBeInTheDocument();
  });

  it('changes the completion mode', async () => {
    const { onDataChange, user } = renderInspector({ moduleSlug: 'coach' });
    await user.selectOptions(screen.getByTestId('node-completion'), 'repeatable');
    expect(onDataChange).toHaveBeenCalledWith('n1', { completionMode: 'repeatable' });
  });

  it('sets a first-arrival workflow, collapsing the blank agent field', async () => {
    const { onDataChange, user } = renderInspector({ moduleSlug: 'coach' });
    await user.type(screen.getByTestId('node-arrival-workflow'), 'welcome');
    expect(onDataChange).toHaveBeenLastCalledWith('n1', {
      onFirstArrival: { workflowSlug: 'welcome' },
    });
  });

  it('clears first-arrival to undefined when the last field is emptied', async () => {
    const { onDataChange, user } = renderInspector({
      moduleSlug: 'coach',
      onFirstArrival: { workflowSlug: 'welcome' },
    });
    await user.clear(screen.getByTestId('node-arrival-workflow'));
    expect(onDataChange).toHaveBeenLastCalledWith('n1', { onFirstArrival: undefined });
  });

  it('shows only the structural note + delete for a region', () => {
    renderInspector({ nodeType: 'region' });
    expect(screen.queryByTestId('node-type')).not.toBeInTheDocument();
    expect(screen.getByText(/groups member nodes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete region/ })).toBeInTheDocument();
  });

  it('deletes the node', async () => {
    const { onDelete, user } = renderInspector({ moduleSlug: 'coach' });
    await user.click(screen.getByRole('button', { name: /Delete node/ }));
    expect(onDelete).toHaveBeenCalledWith('n1');
  });
});
