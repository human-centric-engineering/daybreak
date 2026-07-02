/**
 * Next.js instrumentation hook.
 *
 * Runs once per server process on startup. Two responsibilities:
 *
 *   1. The generic **app boot seam**: call `initApp()` from `lib/app/bootstrap.ts`
 *      in every environment (production + development, nodejs runtime). Sunrise
 *      ships that file empty; a fork fills it (Daybreak boots its framework tier
 *      there). Core carries no reference to the fork's internals — the seam is a
 *      plain call, so an upstream that has no framework folder still builds.
 *   2. An in-process maintenance ticker in **development only** (below).
 *
 * Why the ticker is dev-only:
 *   - Production deployments run the maintenance tick via an external
 *     cron (see `.context/orchestration/scheduling.md`). The cron is
 *     authoritative and survives serverless cold starts.
 *   - Without this hook, dev developers have to remember to POST the
 *     maintenance tick endpoint manually — queued evaluation runs,
 *     scheduled workflows, retry queues etc. otherwise sit idle and
 *     "didn't progress" looks like a bug.
 *
 * The interval mirrors a typical production cron cadence (60s). The
 * shared `runMaintenanceTick()` body holds its own overlap guard, so
 * a slow tick can't pile up — the next interval call skips with a
 * "previous tick still running" log line.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // (1) Generic app boot seam — runs in ALL environments, before the dev-only
  // ticker. A fork fills lib/app/bootstrap.ts; Sunrise ships it empty. Kept as a
  // bare seam call so core never references the fork's framework code.
  //
  // Isolated in try/catch: a fork's boot step must not crash instrumentation or
  // prevent the dev ticker below from arming. The seam call is defensive by
  // construction — core does not rely on the fork's initApp being well-behaved.
  try {
    const { initApp } = await import('@/lib/app/bootstrap');
    await initApp();
  } catch (err) {
    const { logger } = await import('@/lib/logging');
    logger.error('instrumentation: app boot seam (initApp) failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // (2) Dev-only maintenance ticker (production runs the tick via external cron).
  if (process.env.NODE_ENV !== 'development') return;
  if (process.env.SUNRISE_DISABLE_DEV_TICK === '1') return;

  const { runMaintenanceTick } = await import('@/lib/orchestration/maintenance/run-tick');
  const { logger } = await import('@/lib/logging');

  const INTERVAL_MS = 60_000;

  logger.info('Dev maintenance ticker armed', {
    intervalMs: INTERVAL_MS,
    disableEnv: 'SUNRISE_DISABLE_DEV_TICK=1',
  });

  // First tick fires ~3s after startup so the initial dev compile +
  // route warm-up doesn't have to compete with the tick chain for
  // CPU. Subsequent ticks are at INTERVAL_MS cadence.
  const initialDelay = setTimeout(() => {
    void runMaintenanceTick().catch((err: unknown) => {
      logger.error('Dev maintenance tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    setInterval(() => {
      void runMaintenanceTick().catch((err: unknown) => {
        logger.error('Dev maintenance tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, INTERVAL_MS);
  }, 3_000);

  // Some dev runtimes have a `unref` to keep the timer from holding
  // the event loop open at shutdown — guarded for type-safety.
  if (typeof initialDelay.unref === 'function') initialDelay.unref();
}
