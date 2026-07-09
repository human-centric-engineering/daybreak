/**
 * Defensive readers for opaque `FacilitationPolicy.payload` JSON (f-admin-surfaces t-2).
 *
 * A policy's payload is validated server-side (`assertValidFacilitationPolicy`) and opaque
 * (`unknown`) to the client. The policy table (`summarize`) and the per-kind form
 * (`hydratePolicyState`) both read it to display / seed controls, so these narrowers live in
 * one place rather than being re-declared per file. All are TOTAL — a malformed or partial
 * payload yields blanks, never a throw.
 */

/** Narrow an unknown payload node to a readable record, or `undefined` for a non-object. */
export function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** Read a string field from an opaque payload node, or `''`. */
export function str(obj: Record<string, unknown> | undefined, key: string): string {
  const v = obj?.[key];
  return typeof v === 'string' ? v : '';
}

/** Coerce an opaque payload leaf to a display string without risking `[object Object]`. */
export function disp(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '—';
}
