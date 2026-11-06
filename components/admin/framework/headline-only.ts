import { APIClientError } from '@/lib/api/client';

/**
 * An API error with its `details` removed, for `save.report()`.
 *
 * `readSaveError()` shows a VALIDATION_ERROR's `details` in place of its message, which suits a form
 * whose details are field problems. The map and proposal services work the other way round: the
 * message says what to do ("… please re-propose") and the details only back it up, and a map's can
 * run to a dozen validator lines the editor's validation panel already shows.
 */
export function headlineOnly(err: unknown): unknown {
  return err instanceof APIClientError
    ? new APIClientError(err.message, err.code, err.status)
    : err;
}
