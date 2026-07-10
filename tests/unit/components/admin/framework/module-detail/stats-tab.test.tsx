/**
 * StatsTab (f-engagement t-3b) — the read-only module-stats panel. Presentational; asserts
 * the engagement counts and feedback summary render, a fetch failure (`null`) shows the
 * couldn't-load state (not a false all-zero), and a module with no feedback shows the
 * no-feedback line.
 *
 * @see components/admin/framework/module-detail/stats-tab.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatsTab } from '@/components/admin/framework/module-detail/stats-tab';
import type { ModuleStats } from '@/lib/framework/engagement';

const STATS: ModuleStats = {
  moduleSlug: 'onboarding',
  uniqueUsers: 17,
  entries: 42,
  completions: 28,
  returningUsers: 13,
  dwell: { medianMs: 150_000, sampleCount: 9 },
  feedback: {
    count: 3,
    averageRating: 4.33,
    distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 1 },
    recentComments: [
      { rating: 5, comment: 'wonderful onboarding', occurredAt: '2026-07-03T00:00:00.000Z' },
    ],
  },
};

describe('StatsTab', () => {
  it('renders the engagement counts and the feedback summary', () => {
    render(<StatsTab stats={STATS} />);

    expect(screen.getByText('Unique users')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();

    expect(screen.getByText('4.33')).toBeInTheDocument();
    expect(screen.getByText('Recent comments')).toBeInTheDocument();
    expect(screen.getByText('wonderful onboarding')).toBeInTheDocument();
  });

  it('renders the median dwell formatted as a duration with its sample count', () => {
    render(<StatsTab stats={STATS} />);
    expect(screen.getByText('Median dwell')).toBeInTheDocument();
    // 150_000 ms → 2m 30s.
    expect(screen.getByText('2m 30s')).toBeInTheDocument();
    expect(screen.getByText('over 9 sessions')).toBeInTheDocument();
  });

  it('degrades the dwell card to a dash + no-data hint when dwell is null', () => {
    render(<StatsTab stats={{ ...STATS, dwell: null }} />);
    expect(screen.getByText('Median dwell')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('uses the singular session label for a single dwell sample', () => {
    render(<StatsTab stats={{ ...STATS, dwell: { medianMs: 45_000, sampleCount: 1 } }} />);
    // 45_000 ms → 45s (under a minute).
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('over 1 session')).toBeInTheDocument();
  });

  it.each([
    [120_000, '2m'], // whole minutes, no trailing seconds
    [3_900_000, '1h 5m'], // hours + minutes
    [3_600_000, '1h'], // whole hours, no trailing minutes
  ])('formats a %d ms dwell as "%s"', (medianMs, expected) => {
    render(<StatsTab stats={{ ...STATS, dwell: { medianMs, sampleCount: 4 } }} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows the couldn’t-load state on a null stats (never a false all-zero)', () => {
    render(<StatsTab stats={null} />);
    expect(screen.getByText(/couldn.t be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText('Unique users')).not.toBeInTheDocument();
  });

  it('handles a single rating with no comment (singular label, no comments section)', () => {
    render(
      <StatsTab
        stats={{
          ...STATS,
          feedback: {
            count: 1,
            averageRating: 5,
            distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
            recentComments: [],
          },
        }}
      />
    );
    expect(screen.getByText('5.00')).toBeInTheDocument();
    // Ratings exist but none carried a comment → the comments section is omitted.
    expect(screen.queryByText('Recent comments')).not.toBeInTheDocument();
    expect(screen.queryByText('No feedback yet.')).not.toBeInTheDocument();
  });

  it('shows the no-feedback line when a module has engagement but no ratings', () => {
    render(
      <StatsTab
        stats={{
          ...STATS,
          feedback: {
            count: 0,
            averageRating: null,
            distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
            recentComments: [],
          },
        }}
      />
    );
    // Counts still render...
    expect(screen.getByText('17')).toBeInTheDocument();
    // ...but the feedback section degrades to the no-feedback line.
    expect(screen.getByText('No feedback yet.')).toBeInTheDocument();
    expect(screen.queryByText('Recent comments')).not.toBeInTheDocument();
  });
});
