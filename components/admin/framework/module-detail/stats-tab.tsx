/**
 * StatsTab (f-engagement t-3b) — the module detail Stats tab.
 *
 * A read-only panel over t-3a's `GET /modules/[slug]/stats`: engagement counts (unique
 * users, entries, completions, returning users) + a feedback summary (average, 1–5
 * distribution, recent comments), all derived from the insert-only event stream (A9).
 * Presentational only (no client hooks), so it renders as a server component inside the tab
 * host — no client bundle cost.
 *
 * Degrades to a "couldn't load" state on `null` stats (a fetch failure), never a false "no
 * engagement" — which is what legitimate zeros already show.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ModuleStats } from '@/lib/framework/engagement';

interface StatsTabProps {
  /** null when the stats fetch failed (distinct from a real all-zero module). */
  stats: ModuleStats | null;
}

/** Distribution rows render high→low so 5-star sits on top. */
const RATING_ROWS = ['5', '4', '3', '2', '1'] as const;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

export function StatsTab({ stats }: StatsTabProps) {
  if (stats === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Stats couldn’t be loaded. Refresh to try again.
      </p>
    );
  }

  const { uniqueUsers, entries, completions, returningUsers, feedback } = stats;
  // Scale the bars to the tallest bucket; guard the empty case so we never divide by zero.
  const maxCount = Math.max(1, ...Object.values(feedback.distribution));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unique users" value={uniqueUsers} />
        <StatCard label="Entries" value={entries} />
        <StatCard label="Completions" value={completions} />
        <StatCard label="Returning users" value={returningUsers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback.count === 0 ? (
            <p className="text-muted-foreground text-sm">No feedback yet.</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="text-2xl font-semibold tabular-nums">
                  {feedback.averageRating?.toFixed(2) ?? '—'}
                </span>{' '}
                <span className="text-muted-foreground">
                  average over {feedback.count.toLocaleString()}{' '}
                  {feedback.count === 1 ? 'rating' : 'ratings'}
                </span>
              </p>

              <div className="space-y-1">
                {RATING_ROWS.map((rating) => {
                  const n = feedback.distribution[rating] ?? 0;
                  return (
                    <div key={rating} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-4 tabular-nums">{rating}</span>
                      <div className="bg-muted h-2 flex-1 overflow-hidden rounded">
                        <div
                          className="bg-primary h-full rounded"
                          style={{ width: `${(n / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-8 text-right tabular-nums">{n}</span>
                    </div>
                  );
                })}
              </div>

              {feedback.recentComments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase">
                      Recent comments
                    </p>
                    <ul className="space-y-3">
                      {feedback.recentComments.map((comment, i) => (
                        <li key={`${comment.occurredAt}-${i}`} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium tabular-nums">{comment.rating}/5</span>
                            <span className="text-muted-foreground text-xs">
                              {new Date(comment.occurredAt).toLocaleDateString()}
                            </span>
                          </div>
                          {/* React escapes the free-text comment — no XSS. */}
                          <p className="text-foreground/90">{comment.comment}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
