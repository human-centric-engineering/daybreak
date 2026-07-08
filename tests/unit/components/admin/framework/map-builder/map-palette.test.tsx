/**
 * MapPalette (f-map-editor t-1) — the draggable node-kind sidebar. Proves it renders
 * a block per kind, sets the drag payload on dragstart, and shows the usage count
 * badge.
 *
 * @see components/admin/framework/map-builder/map-palette.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MapPalette } from '@/components/admin/framework/map-builder/map-palette';

describe('MapPalette', () => {
  it('renders a draggable block for each of the four node kinds', () => {
    render(<MapPalette />);
    for (const type of ['module', 'stage', 'milestone', 'region']) {
      expect(screen.getByTestId(`map-palette-block-${type}`)).toBeInTheDocument();
    }
  });

  it('sets the react-flow drag payload to the node type on dragstart', () => {
    render(<MapPalette />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByTestId('map-palette-block-region'), {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith('application/reactflow', 'region');
  });

  it('shows a usage count badge for kinds that are on the canvas', () => {
    render(<MapPalette typeCounts={{ module: 3 }} />);
    expect(screen.getByTestId('map-palette-count-module')).toHaveTextContent('3');
    expect(screen.queryByTestId('map-palette-count-stage')).not.toBeInTheDocument();
  });
});
