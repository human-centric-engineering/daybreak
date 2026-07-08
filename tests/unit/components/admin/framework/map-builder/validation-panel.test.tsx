/**
 * ValidationPanel (f-map-editor t-3) — the live-preflight error strip. Proves it hides
 * when clean, lists each issue with its code + message, selects the referenced node on
 * click, and renders an edge-scoped (node-less) issue as non-interactive text.
 *
 * @see components/admin/framework/map-builder/validation-panel.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ValidationPanel } from '@/components/admin/framework/map-builder/validation-panel';
import type { MapEditorIssue } from '@/components/admin/framework/map-builder/map-validation';

const nodeIssue: MapEditorIssue = {
  code: 'UNREACHABLE_NODE',
  message: 'Node "b" is unreachable.',
  nodeKeys: ['b'],
};
const edgeIssue: MapEditorIssue = {
  code: 'DANGLING_EDGE_ENDPOINT',
  message: 'Edge a→ghost references unknown node "ghost".',
  nodeKeys: [],
};

describe('ValidationPanel', () => {
  it('renders nothing when there are no issues', () => {
    const { container } = render(<ValidationPanel issues={[]} onSelectNode={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each issue with its code and message and a summary count', () => {
    render(<ValidationPanel issues={[nodeIssue, edgeIssue]} onSelectNode={vi.fn()} />);
    expect(screen.getByText('2 validation issues')).toBeInTheDocument();
    expect(screen.getByText('UNREACHABLE_NODE')).toBeInTheDocument();
    expect(screen.getByText(/is unreachable/)).toBeInTheDocument();
  });

  it('selects the referenced node when a node-scoped issue is clicked', async () => {
    const onSelectNode = vi.fn();
    const user = userEvent.setup();
    render(<ValidationPanel issues={[nodeIssue]} onSelectNode={onSelectNode} />);
    await user.click(screen.getByTestId('map-issue-0'));
    expect(onSelectNode).toHaveBeenCalledWith('b');
  });

  it('renders an edge-scoped issue as non-interactive text (no button)', () => {
    render(<ValidationPanel issues={[edgeIssue]} onSelectNode={vi.fn()} />);
    const item = screen.getByTestId('map-issue-0');
    expect(item.tagName).not.toBe('BUTTON');
  });
});
