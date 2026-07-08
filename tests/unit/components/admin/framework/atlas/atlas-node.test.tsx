/**
 * AtlasNode (f-atlas t-2a) — the read-only composition node. Presentational: colours by entity kind,
 * shows a deep-link affordance only when the node has an `href`. React Flow's `Handle`/`Position` are
 * mocked (no canvas context in happy-dom).
 *
 * @see components/admin/framework/atlas/atlas-node.tsx
 */

import type { NodeProps } from '@xyflow/react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { vi } from 'vitest';
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

import { AtlasNode } from '@/components/admin/framework/atlas/atlas-node';
import type { AtlasFlowNode, AtlasNodeData } from '@/components/admin/framework/atlas/atlas-mapper';

function renderNode(data: Partial<AtlasNodeData>) {
  const full: AtlasNodeData = { kind: 'module', label: 'Reading', href: null, ...data };
  return render(<AtlasNode {...({ data: full } as unknown as NodeProps<AtlasFlowNode>)} />);
}

describe('AtlasNode', () => {
  it('renders the label, sublabel and badge, keyed to the entity kind', () => {
    renderNode({ kind: 'agent', label: 'Aria', sublabel: 'aria', badge: 'removed' });
    const el = screen.getByTestId('atlas-node-agent');
    expect(screen.getByText('Aria')).toBeInTheDocument();
    expect(screen.getByText('aria')).toBeInTheDocument();
    expect(screen.getByText('removed')).toBeInTheDocument();
    expect(el.className).toContain('emerald'); // agent → emerald treatment
  });

  it('shows a link affordance + pointer cursor only when the node has an href', () => {
    const { container, rerender } = renderNode({
      kind: 'module',
      href: '/admin/framework/modules/reading',
    });
    expect(screen.getByTestId('atlas-node-module').className).toContain('cursor-pointer');
    expect(container.querySelector('svg.lucide-external-link')).toBeTruthy();

    rerender(
      <AtlasNode
        {...({
          data: { kind: 'slot', label: 'goal', href: null },
        } as unknown as NodeProps<AtlasFlowNode>)}
      />
    );
    expect(screen.getByTestId('atlas-node-slot').className).not.toContain('cursor-pointer');
    expect(container.querySelector('svg.lucide-external-link')).toBeFalsy();
  });
});
