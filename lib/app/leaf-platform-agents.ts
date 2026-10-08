/**
 * Leaf-app platform-agent registrations — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) registers its own platform agents here: agents every org gets its
 * own instance of, defined in code and kept in line with the definition by core's reconcile
 * (Sunrise §116; guide: `.context/orchestration/platform-agents.md`). Daybreak keeps this empty: it
 * is the leaf's seam, reserved so a leaf's registrations merge cleanly on upgrade — the
 * platform-agent analogue of `lib/app/leaf-bootstrap.ts` and `lib/app/leaf-data-export.ts`.
 *
 * Called by `lib/app/platform-agents.ts`'s `initAppPlatformAgents()` AFTER the framework tier
 * registers its own (the framework-rubric judge, `eval-judge-framework-rubric`). So registering a
 * slug the framework or Sunrise already uses replaces that definition in every org — allowed, and
 * logged at warn, because it changes an agent every org runs.
 *
 * ```ts
 * import { registerPlatformAgent } from '@/lib/orchestration/agents/platform-agents';
 *
 * export function initLeafPlatformAgents(): void {
 *   registerPlatformAgent({
 *     slug: 'intake-triage',
 *     audience: 'every-org',
 *     agent: {
 *       name: 'Intake Triage',
 *       description: 'Routes new requests to the right queue.',
 *       systemInstructions: 'You triage incoming requests…',
 *       temperature: 0.2,
 *       maxTokens: 2048,
 *     },
 *     capabilities: ['search_knowledge_base'],
 *     knowledgeTags: [],
 *   });
 * }
 * ```
 *
 * Do not register from `initApp()` / `initLeafApp()`: core reads this registry lazily in whichever
 * realm reads first, so a boot-time registration fills a map the reconcile never sees.
 *
 * @see lib/app/platform-agents.ts · lib/framework/platform-agents.ts
 */
export function initLeafPlatformAgents(): void {
  // No leaf platform agents by default.
}
