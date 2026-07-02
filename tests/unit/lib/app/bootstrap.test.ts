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
vi.mock('@/lib/framework', () => ({ initFramework: vi.fn() }));
vi.mock('@/lib/app/leaf-bootstrap', () => ({ initLeafApp: vi.fn(() => Promise.resolve()) }));

const { initApp } = await import('@/lib/app/bootstrap');
const { initFramework } = await import('@/lib/framework');
const { initLeafApp } = await import('@/lib/app/leaf-bootstrap');
const { logger } = await import('@/lib/logging');

const initFrameworkMock = initFramework as ReturnType<typeof vi.fn>;
const initLeafAppMock = initLeafApp as ReturnType<typeof vi.fn>;
const loggerError = logger.error as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initApp (boot bridge)', () => {
  it('boots the framework, then the leaf hook, without logging an error', async () => {
    await initApp();
    expect(initFrameworkMock).toHaveBeenCalledTimes(1);
    expect(initLeafAppMock).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
    // framework strictly before leaf
    expect(initFrameworkMock.mock.invocationCallOrder[0]).toBeLessThan(
      initLeafAppMock.mock.invocationCallOrder[0]
    );
  });

  it('logs and continues when framework init throws — leaf still runs, initApp does not reject', async () => {
    initFrameworkMock.mockImplementationOnce(() => {
      throw new Error('framework boom');
    });
    await expect(initApp()).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledTimes(1);
    // The leaf hook must still run despite the framework failure.
    expect(initLeafAppMock).toHaveBeenCalledTimes(1);
  });
});
