/**
 * RegionNode (f-map-editor t-2b) — the custom group container. `@xyflow/react`
 * primitives are mocked (no flow context in happy-dom); this proves the header
 * renders, the chevron reflects + toggles collapse through the editor context, and
 * the collapsed frame is tagged.
 *
 * @see components/admin/framework/map-builder/region-group.tsx
 */

import type { NodeProps } from '@xyflow/react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  NodeResizer: () => null,
}));

import { RegionNode } from '@/components/admin/framework/map-builder/region-group';
import { MapEditorProvider } from '@/components/admin/framework/map-builder/map-editor-context';
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

function renderRegion(
  over: { collapsed?: boolean; selected?: boolean } = {},
  onToggleCollapse = vi.fn()
) {
  const data: MapFlowNode['data'] = {
    label: 'onboarding',
    nodeType: 'region',
    completionMode: 'once',
    collapsed: over.collapsed ?? false,
  };
  const props = { id: 'zone', data, selected: over.selected ?? false };
  render(
    <MapEditorProvider value={{ onToggleCollapse }}>
      <RegionNode {...(props as unknown as NodeProps<MapFlowNode>)} />
    </MapEditorProvider>
  );
  return { onToggleCollapse };
}

describe('RegionNode', () => {
  it('renders the region label and header', () => {
    renderRegion();
    expect(screen.getByTestId('map-region-zone')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByText('onboarding')).toBeInTheDocument();
    expect(screen.getByText('region')).toBeInTheDocument();
  });

  it('reflects a collapsed region and exposes the expand control', () => {
    renderRegion({ collapsed: true });
    expect(screen.getByTestId('map-region-zone')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: 'Expand region' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('toggles collapse through the editor context', async () => {
    const user = userEvent.setup();
    const { onToggleCollapse } = renderRegion();
    await user.click(screen.getByRole('button', { name: 'Collapse region' }));
    expect(onToggleCollapse).toHaveBeenCalledWith('zone');
  });
});
