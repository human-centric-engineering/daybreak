/**
 * Structure-change proposal authorship (f-emergence t-2, spec §5.5 F17).
 *
 * A proposal's `createdBy` records who authored it — an AGENT (`"agent:<slug>"`) or a human user (a
 * plain user id) — and that authorship is preserved in the published version's `createdBy` when an
 * approved proposal publishes (F17: _"`createdBy = "agent:<slug>"` preserved in version history"_).
 * The `createdBy` column is a plain `String` (no `User` FK, X6) precisely so it can hold either
 * form. These helpers format and parse the `"agent:"` convention in one place.
 */

const AGENT_PREFIX = 'agent:';

export type ProposalAuthor = { kind: 'agent'; slug: string } | { kind: 'user'; userId: string };

/** Format an agent author for `createdBy`, e.g. `formatAgentAuthor('onboarding') → 'agent:onboarding'`. */
export function formatAgentAuthor(slug: string): string {
  return `${AGENT_PREFIX}${slug}`;
}

/** Parse a `createdBy` value into its author kind. An `agent:` prefix ⇒ agent; anything else ⇒ user. */
export function parseAuthor(createdBy: string): ProposalAuthor {
  if (createdBy.startsWith(AGENT_PREFIX)) {
    return { kind: 'agent', slug: createdBy.slice(AGENT_PREFIX.length) };
  }
  return { kind: 'user', userId: createdBy };
}
