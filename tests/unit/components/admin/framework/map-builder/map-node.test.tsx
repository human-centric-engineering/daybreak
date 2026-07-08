/**
 * MapNode (f-map-editor t-1) — the editable canvas node. `@xyflow/react`'s `Handle`
 * is stubbed (no flow context in happy-dom); this proves the node paints its key,
 * kind, module binding, and the selected / error ring branches.
 *
 * @see components/admin/framework/map-builder/map-node.tsx
 */

import type { NodeProps } from '@xyflow/react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

import { MapNode } from '@/components/admin/framework/map-builder/map-node';
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

type Data = MapFlowNode['data'];

// A concrete (index-signature-free) shape for the fields these tests set, so the
// spread into the node data stays a plain object spread.
interface NodeOverrides {
  label?: string;
  nodeType?: Data['nodeType'];
  moduleSlug?: string;
  hasError?: boolean;
}

function renderNode(data: NodeOverrides, selected = false) {
  const full = {
    label: 'n',
    nodeType: 'milestone',
    completionMode: 'once',
    ...data,
  } as unknown as Data;
  // NodeProps carries many fields; the node reads only `data` + `selected`.
  return render(<MapNode {...({ data: full, selected } as unknown as NodeProps<MapFlowNode>)} />);
}

describe('MapNode', () => {
  it('shows the node key, kind, and a module binding', () => {
    renderNode({ label: 'welcome', nodeType: 'module', moduleSlug: 'onboarding' });
    expect(screen.getByText('welcome')).toBeInTheDocument();
    expect(screen.getByText('module')).toBeInTheDocument();
    expect(screen.getByText('onboarding')).toBeInTheDocument();
    expect(screen.getByTestId('map-node-module')).toBeInTheDocument();
  });

  it('announces a validation error for the ring branch', () => {
    renderNode({ label: 'bad', hasError: true });
    expect(screen.getByText('Node has validation errors')).toBeInTheDocument();
  });

  it('renders without a module binding line for non-module kinds', () => {
    renderNode({ label: 'stage-1', nodeType: 'stage' });
    expect(screen.getByText('stage-1')).toBeInTheDocument();
    expect(screen.getByTestId('map-node-stage')).toBeInTheDocument();
  });
});
