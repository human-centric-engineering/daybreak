/**
 * MapEdge (f-map-editor t-2) — the custom typed-edge component. `@xyflow/react`'s
 * edge primitives are mocked (no flow context in happy-dom); this proves the edge
 * labels itself by kind, tags the type, and shows the gated badge when a condition
 * is present.
 *
 * @see components/admin/framework/map-builder/map-edge.tsx
 */

import type { ReactNode } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  getBezierPath: () => ['M0,0', 5, 6] as const,
}));

import { MapEdge } from '@/components/admin/framework/map-builder/map-edge';
import type { MapCondition, EdgeType } from '@/lib/framework/facilitation/map/schema';

function renderEdge(data: { edgeType?: EdgeType; condition?: MapCondition }, selected = false) {
  const props = {
    id: 'e1',
    sourceX: 0,
    sourceY: 0,
    targetX: 10,
    targetY: 10,
    data: { edgeType: data.edgeType ?? 'prerequisite', condition: data.condition },
    selected,
  };
  return render(<MapEdge {...(props as unknown as EdgeProps)} />);
}

describe('MapEdge', () => {
  it('labels the edge with its kind and tags the type', () => {
    renderEdge({ edgeType: 'unlocks' });
    const label = screen.getByTestId('map-edge-label-e1');
    expect(label).toHaveAttribute('data-edge-type', 'unlocks');
    expect(label).toHaveTextContent('Unlocks');
  });

  it('shows a gated badge only when the edge carries a condition', () => {
    const { rerender } = renderEdge({ edgeType: 'prerequisite' });
    expect(screen.queryByLabelText('gated')).not.toBeInTheDocument();

    rerender(
      <MapEdge
        {...({
          id: 'e1',
          sourceX: 0,
          sourceY: 0,
          targetX: 10,
          targetY: 10,
          data: {
            edgeType: 'prerequisite',
            condition: { family: 'state', milestone: 'a', reached: true },
          },
        } as unknown as EdgeProps)}
      />
    );
    expect(screen.getByLabelText('gated')).toBeInTheDocument();
  });
});
