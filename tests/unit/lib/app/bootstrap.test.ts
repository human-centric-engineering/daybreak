/**
 * initApp() orchestration unit test — the boot bridge core's `instrumentation.ts`
 * calls. Mocks the framework and leaf hooks so we assert initApp's own control
 * flow: it boots the framework THEN the leaf hook, and — the load-bearing
 * resilience contract — a framework boot failure is logged (not thrown) and does
 * NOT prevent the leaf hook or callers. The real framework registration is
 * covered by init.test.ts; the real end-to-end chain by
 * tests/integration/lib/framework/boot.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/framework', () => ({
  initFramework: vi.fn(),
  syncFramework: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/app/leaf-bootstrap', () => ({ initLeafApp: vi.fn(() => Promise.resolve()) }));

const { initApp } = await import('@/lib/app/bootstrap');
const { initFramework, syncFramework } = await import('@/lib/framework');
const { initLeafApp } = await import('@/lib/app/leaf-bootstrap');
const { logger } = await import('@/lib/logging');

const initFrameworkMock = initFramework as ReturnType<typeof vi.fn>;
const syncFrameworkMock = syncFramework as ReturnType<typeof vi.fn>;
const initLeafAppMock = initLeafApp as ReturnType<typeof vi.fn>;
const loggerError = logger.error as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initApp (boot bridge)', () => {
  it('boots framework → leaf hook → framework sync, in order, without logging an error', async () => {
    await initApp();
    expect(initFrameworkMock).toHaveBeenCalledTimes(1);
    expect(initLeafAppMock).toHaveBeenCalledTimes(1);
    expect(syncFrameworkMock).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
    // Strict order: framework init < leaf hook < framework sync. The sync must run
    // last so every framework- AND leaf-registered module reaches its row.
    expect(initFrameworkMock.mock.invocationCallOrder[0]).toBeLessThan(
      initLeafAppMock.mock.invocationCallOrder[0]
    );
    expect(initLeafAppMock.mock.invocationCallOrder[0]).toBeLessThan(
      syncFrameworkMock.mock.invocationCallOrder[0]
    );
  });

  it('logs and continues when framework init throws — leaf and sync still run, initApp does not reject', async () => {
    initFrameworkMock.mockImplementationOnce(() => {
      throw new Error('framework boom');
    });
    await expect(initApp()).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledTimes(1);
    // The leaf hook and the sync must still run despite the init failure (the
    // framework import itself succeeded, so sync is not skipped).
    expect(initLeafAppMock).toHaveBeenCalledTimes(1);
    expect(syncFrameworkMock).toHaveBeenCalledTimes(1);
  });

  it('logs and continues when framework sync throws — initApp does not reject', async () => {
    syncFrameworkMock.mockRejectedValueOnce(new Error('db down'));
    await expect(initApp()).resolves.toBeUndefined();
    // A DB-unavailable boot is logged, not thrown, so instrumentation.register()
    // and the dev ticker are unaffected.
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(initLeafAppMock).toHaveBeenCalledTimes(1);
  });

  it('stringifies non-Error throwables in both catch blocks', async () => {
    initFrameworkMock.mockImplementationOnce(() => {
      throw 'init-string-fail'; // eslint-disable-line @typescript-eslint/only-throw-error
    });
    syncFrameworkMock.mockRejectedValueOnce('sync-string-fail');

    await expect(initApp()).resolves.toBeUndefined();

    // Both failures are logged with the raw value coerced via String(err) — the
    // non-Error side of each catch's `err instanceof Error ? … : String(err)`.
    expect(loggerError).toHaveBeenCalledTimes(2);
    expect(loggerError).toHaveBeenNthCalledWith(1, expect.any(String), {
      error: 'init-string-fail',
    });
    expect(loggerError).toHaveBeenNthCalledWith(2, expect.any(String), {
      error: 'sync-string-fail',
    });
  });
});
