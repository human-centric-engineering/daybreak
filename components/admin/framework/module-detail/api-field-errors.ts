import { APIClientError } from '@/lib/api/client';

/**
 * Flatten an `APIClientError`'s field-level `details` into display messages, falling back to
 * the error's own message (or a supplied default). Shared by the module-detail tabs' inline
 * write forms (config / settings / agents / …), which all surface the server's field errors
 * the same way — the server is the validation source of truth, so the client renders whatever
 * `details` it returns rather than re-deriving messages.
 */
export function apiFieldErrors(err: unknown, fallback: string): string[] {
  if (err instanceof APIClientError && err.details) {
    const msgs = Object.values(err.details)
      .flat()
      .filter((m): m is string => typeof m === 'string');
    if (msgs.length > 0) return msgs;
  }
  return [err instanceof Error ? err.message : fallback];
}
