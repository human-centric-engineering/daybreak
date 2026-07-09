/**
 * Integration test — proposal view helpers (f-admin-surfaces t-3).
 *
 * The small shared presentational bits the queue and review detail both render:
 * `AuthorLabel` (agent badge vs plain user id) and `StatusBadge` (per-status variant with
 * an `outline` fallback for a forward-compat unknown status).
 *
 * @see components/admin/framework/proposals/proposal-view-helpers.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  AuthorLabel,
  StatusBadge,
} from '@/components/admin/framework/proposals/proposal-view-helpers';

describe('AuthorLabel', () => {
  it('renders an agent author as a badge', () => {
    render(<AuthorLabel createdBy="agent:onboarding" />);
    expect(screen.getByText('agent:onboarding')).toBeInTheDocument();
  });

  it('renders a user author as a plain id', () => {
    render(<AuthorLabel createdBy="user_alice" />);
    expect(screen.getByText('user_alice')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it.each(['pending', 'approved', 'rejected', 'published'])('renders the %s status', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('renders an unknown (forward-compat) status via the outline fallback', () => {
    // A stored status outside the v1 vocabulary — the `?? 'outline'` fallback branch.
    render(<StatusBadge status="archived" />);
    expect(screen.getByText('archived')).toBeInTheDocument();
  });
});
