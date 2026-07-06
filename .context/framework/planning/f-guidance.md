---
name: f-guidance
feature: 12 · f-guidance
epic: Framework v1
status: in flight (both deps shipped — f-engine ✅, f-slot-capture ✅)
owner: John
depends_on: f-engine (shipped — #34 / #36 / #37 / #38, for `computeAvailability` / `applyEvent` / `resolveJourneyNow` / `getPublishedGraph`) · f-slot-capture (shipped — #42–#46, for the framework capability-registration seam + `getSlotHeads` recency reads) · f-journey-state (shipped — #27 / #28, for the `canRead`-guarded journey queries) · coordinates-with f-module-bindings (07, in flight — Simon; the `isInModuleScope` reader X5 completes)
spec: framework-architecture.md §5.4 (guidance — the advisory layer) · §5.1/5.3 (engine it reads) + Appendix A — F12 (guidance consumed only through granted capabilities; ranks already-eligible options) · X5 (surface-scoped conversations) · the context-contributor registry on `buildContext()`
parent: plan.md
opened: 2026-07-05
---

# f-guidance — the advisory layer, its capabilities & chat injection

> Feature-level build plan for **`f-guidance`** (12), the fourth layer of the facilitation
> anatomy (§5.4) and the **head of the remaining critical path**. Parent:
> [[plan#12 · `f-guidance` — guidance service, capabilities & chat injection|plan.md]].
> Binding _how_: [[framework-architecture#5.4 Guidance — "what would serve the user best right now"|spec §5.4]]
>
> - Appendix A — **F12** (guidance is consumed **only** through granted capabilities and
>   **ranks already-eligible options** using the freshest slots), **X5** (conversations are
>   surface-scoped; continuity travels as state, not threads), and the **context-contributor
>   registry** on `buildContext()`. Sizing follows the parent plan: **task = one PR** (~200–600 lines).

## Intent

The engine (`f-engine`, shipped) computes **what is possible** — `computeAvailability` returns
the eligible `validMoves` and a reasoned `perNode` verdict; `applyEvent` is the sole writer of
state. `f-slot-capture` (shipped) captures **what is known** — the freshest slots. Neither ranks,
narrates, or reaches a live conversation. **f-guidance is the advisory layer that closes that
gap**: a pure-cored service (`guidance.ts`) that ranks the engine's already-eligible options using
recency-weighted slot reads (F12 — _"the engine computes what is possible; guidance ranks what is
wise; agents narrate — reading from the engine, never guessing"_), a family of **built-in
capabilities** through which — and only through which — agents consume it, and the **per-turn
context injection** that is the first moment the experience is _felt_ in a conversation (§5.4).

It is deliberately the layer with the **widest brief** in the spec, so the discipline here is to
ship exactly the four spec-named responsibilities that are _reactive and structural_ — rank,
expose, inject, scope — and to leave the additive inputs (similarity, proactive nudges) as
**labelled seams** their owning features fill, not stubs this feature ships.

## What ships here, and what deliberately does not

**In scope.**

- **`guidance.ts` — the service.** (a) The **input assembler** the pure engine deliberately left
  to this feature (`apply-event.ts` header names f-guidance as its owner): load the published graph
  - `canRead`-guarded node-states + `canRead`-guarded slot heads + per-module liveness + resolved
    `now`, and hand them to `computeAvailability` / `applyEvent`. (b) The **recency-weighted ranking**
    of the engine's `validMoves` (reasons in the payload), and the linger/move `suggestFocus` call. (c)
    A **progress-synopsis digest** of the event log scoped for narration.
- **The guidance capability family** — built-in `BaseCapability`s via the shipped framework
  capability-registration seam: **read** — `get_journey_state`, `get_next_steps`,
  `get_progress_synopsis`, `suggest_focus`; **write** — `request_transition` (over the engine's sole
  writer `applyEvent`).
- **Per-turn context injection** — enrich the framework's existing `'module'` context contributor
  (already registered, currently a scaffold) so a module-scoped conversation's prompt carries the
  module's config-relevant context + the user's journey position + selected fresh slots, kept current
  per turn — through the existing `registerContextContributor` seam (no core edit).
- **Surface-scoped conversations (X5)** — a framework-owned chat route that opens a module surface
  with its **bound primary agent**, sets `contextType`/`contextId`, and **populates `scope.moduleSlug`**
  — the write half that completes f-module-bindings' scope-refusal seam (`isInModuleScope`).

**Out of scope** (owned elsewhere / a later phase, so no dead surface lands early):

- **pgvector "related places" similarity** — the advisory overlay §5.4 mentions is **Phase 6 /
  `f-overlays` (19)**. The ranking payload ships a **labelled, empty `related` slot** for it (shape
  the seam; a fake similarity is exactly the demo-data a fork must delete).
- **Proactive / outbound guidance (F13)** — the scheduled run of the same ranking over active
  journeys is **Phase 6**. `guidance.ts`'s ranking is built as a **pure, reusable function** so the
  future `AiWorkflowSchedule` runner calls it unchanged — but no scheduler, nudge dispatch, or hook
  wiring ships here.
- **The facilitation agent family + `FacilitationAgentBinding`** — §5.4 names it, but it is
  **`f-facilitation-agents` (13)**. This feature ships the **capabilities they will be granted**, not
  the agents or their binding mechanism.
- **Governance / policy gating on guidance outputs** → `f-policies` (17). **Admin journey dry-run
  UI** (the pure functions' natural consumer) → `f-map-editor` (14). **Slot transparency UI** →
  `f-ops-views` (15).

## Reconciliation with current repo reality — the design decisions

Organising principle, carried from [[f-engine]] / [[f-slot-capture]]: **ship nothing a fork has to
delete**, and **follow the shipped code, not the rev-16 spec sketch**. Every "assumed landed"
precedent is verified against the tree (§ _Reuse anchors_). Decisions (2026-07-05):

1. **`guidance.ts` lives in `lib/framework/guidance/` and owns the `computeAvailability` /
   `applyEvent` input assembler — the seam the engine deliberately left open.** The engine is pure:
   `computeAvailability(input)` / `applyEvent(input)` take a fully-assembled `AvailabilityInput`
   (`graph`, `nodeStates`, `slots`, `moduleLiveness`, `now`) and there is **no assembler in-tree** —
   `apply-event.ts`'s header states outright that "the assembler that loads the graph + state + slots
   - liveness + `canRead`-guards the reads **are f-guidance / f-facilitation-agents**." So t-1 builds
     `assembleAvailabilityInputs(viewer, journeyKey, scope?)`: `getPublishedGraph(graphSlug)` +
     `getNodeStates(viewer, …)` (canRead) + `getSlotHeads(userId)` (canRead subject) + a
     `Map<slug, ModuleLiveness>` built from `isModuleLive(...)` per module + `resolveJourneyNow(userId)`.
     This assembler is **the reused seam `f-facilitation-agents` (13) inherits** — build it as its final
     generic shape.

2. **Ranking = recency-weighted slot scoring over the engine's `validMoves`, reasons in the payload —
   never re-deciding eligibility.** `computeAvailability` already returns the eligible set
   (`validMoves`) and every locked node's `lockReasons`. Guidance **only ranks the already-eligible**
   (F12 enforced by construction — it never re-evaluates a gate). The score reads `getSlotHeads`
   (already `capturedAt desc`, served by `@@index([userId, capturedAt])`): recency (freshness),
   `confidence` (1–10), low-confidence/recently-changed areas, and declared preferences; the advisory
   `recommended_by` temporal condition (conditions.ts — advisory-only, never gates) contributes a soft-
   deadline nudge. Each ranked option carries a **human-readable reason string**. The payload includes
   a **`related: []`** field, labelled advisory, that **f-overlays (19)** fills with pgvector hits —
   shipped empty here.

3. **The capability family uses the shipped framework capability-registration seam (f-slot-capture
   t-1) — one edit point.** New `lib/framework/guidance/capabilities/*.ts` `BaseCapability` subclasses
   (template: `data-slots/capabilities/get-state.ts`), array-exported from a barrel, registered by a
   single loop added to `initFramework()` (`lib/framework/index.ts`) alongside the data-slots loop;
   `syncFramework()` already picks them up (`registerFrameworkCapabilityHandlers` + `syncFrameworkCapabilities`).
   **PII posture — resolved in the t-2 build: all four read caps are `processesPii = false`.** The
   plan anticipated `get_next_steps`/`suggest_focus`/`get_progress_synopsis` might carry slot-derived
   PII, but t-1 built the ranking reasons + synopsis from **authored map vocabulary** (node keys, slot
   _slugs_, event types, timestamps, authored dates) — **never a captured slot value**. Both the t-1
   and t-2 security reviews confirmed no free-text PII reaches any output field, so none needs
   `redactProvenance` (contrast `get_state`, which returns the slot `value` and does). Each still guards
   `context.userId === null` → structured `no_user_context` error. **Journey key:** the caps take
   `graphSlug` (+ optional `contextKey`, X3) as args; the **subject is always `context.userId`** (never
   an arg), so a cap only ever reads one of the caller's _own_ journeys.

4. **`request_transition` is the write cap over `applyEvent` — split from the reads by the write
   boundary (the f-slot-capture `get_state`/`fill_slot` discipline).** It assembles the same inputs
   and calls the engine's **sole writer** `applyEvent({ transition: { userId, journeyId, nodeKey, kind:
'enter' | 'complete' } })`, returning the new node-state on `ok` or **narrating the `Rejection`'s
   `lockReasons`** on refusal (`unknown_node` / `not_available` / `not_active`). The spec's "may be
   user-confirmed first" is a **surface/agent UX concern, not the capability's** — the cap is the
   mechanism; confirm-first is how an agent chooses to call it (out of scope here). This is the second
   framework write capability (after `fill_slot`).

5. **Context injection enriches the existing `'module'` contributor — single composed block per
   `contextType`, no core edit. REVISED in the build: user-agnostic part in t-4, per-user part
   deferred to t-4b.** The seam is shipped (`registerContextContributor(type, loader)` on core
   `buildContext()`; the framework registers `MODULE_CONTEXT_TYPE = 'module'` → `loadModuleContext`,
   a scaffold). The plan assumed one contributor could compose **module config + journey position +
   fresh slots** into one body — but two hard core-seam facts surfaced at build time: the contributor
   signature is `(id) => Promise<string>` (it receives **no `userId`**), and `buildContext` **caches the
   result per `(type, id)` for 60 s** — so injecting **per-user** content (journey/slots) would serve
   one user's data to another (a cross-user leak), and can't even resolve the user. Both are
   **Sunrise-core** properties; changing them is a forbidden core edit. **Resolved:** t-4 ships the
   **user-agnostic** half — `loadModuleContext` composes the module's **name + description** from the
   code registry (`getRegisteredModules`, no DB, safe with the `(type, id)` cache), which is §5.4's
   "the module's config-relevant context". The **per-user journey position + fresh slots injection** is
   split to **t-4b**, gated on a Sunrise **seam widening** (userId in the contributor + a user-aware
   cache) filed in [[upstream-asks]]. **Nothing is blocked meanwhile:** agents already read journey
   position + slots **per turn** via the t-2 capabilities (`get_journey_state`, …) — only the automatic
   prompt-_injection_ of them defers. The boundary test (strip framework → `buildContext` has one fewer
   contributor) is already proven by `boot.test.ts`.

6. **Surface-scoped conversations (X5) ride a NEW framework-owned chat route — the core handler and
   consumer schema stay untouched.** `ChatRequest.scope` (`Record<string,string>`) is threaded
   end-to-end and read at `streaming-handler.ts:1609` into `CapabilityContext.scope` — but **nothing
   populates it**, and the **core** `consumerChatRequestSchema` / `app/api/v1/chat/stream/route.ts`
   carry no scope field. Editing either is a **Sunrise-core edit (forbidden)**. So t-5 adds a
   **framework-owned** chat route (under an `app/api/v1/.../framework/` segment) that: resolves the
   module's **bound primary agent** (`ModuleAgentBinding.isPrimary`, via `modules/bindings/queries.ts`),
   sets `contextType: 'module'` / `contextId: moduleSlug`, and calls `streamChat({ …, scope:
encodeScope({ moduleSlug }) })` (`encodeScope` from `shared/scope.ts`). The core handler is reused
   **unchanged** — the line-1609 read is the sanctioned seam.

7. **The scope-refusal reader is already merged as `isInModuleScope` (NOT `assertInModuleScope`) —
   correct the name, and do NOT unilaterally flip its posture.** f-module-bindings t-2 (#35, merged)
   shipped `isInModuleScope(context, moduleSlug)` in `modules/capabilities/namespace.ts`, whose interim
   posture is **absent scope ⇒ ALLOW** (its comment names f-guidance X5 as what will populate the
   scope). Once t-5 writes `scope.moduleSlug`, that existing predicate **enforces naturally** for module
   surfaces — no reader work needed. Flipping the posture to **refuse-on-absent** is a one-line edit
   (`namespace.ts`) but **breaks Simon's t-2 tests** (they assert allow-on-absent) and is a **governance
   decision, not this feature's** — leave it, and note the option. _(Correct the stale
   `assertInModuleScope` references in `plan.md` at the same time.)_

8. **Surface conversation resume is a framework-side lookup, not a core uniqueness constraint.**
   `AiConversation` has `contextType`/`contextId` (+ a non-unique `@@index`) but **no** uniqueness on
   `(agentId, contextType, contextId)` and **no** find-by-context resume (resume is by explicit
   `conversationId` only). Adding a unique constraint = a **core migration (forbidden)**. So the
   framework route does a lightweight lookup — most-recent active `AiConversation` for `(userId,
agentId, contextType, contextId)` → resume, else let the handler create — keeping "one live surface
   per (user, module)" a framework-side convention over the unchanged core model.

## Reuse anchors found in-tree

- **The engine** — `computeAvailability(AvailabilityInput) → { perNode, validMoves, firsts }` +
  `applyEvent(ApplyEventInput) → { ok, nodeState, event } | { ok:false, rejection }`
  ([`facilitation/engine/availability.ts`](../../lib/framework/facilitation/engine/availability.ts) /
  [`apply-event.ts`](../../lib/framework/facilitation/engine/apply-event.ts)); `resolveJourneyNow`
  ([`engine/now.ts`](../../lib/framework/facilitation/engine/now.ts)); `getPublishedGraph`
  ([`engine/published-graph.ts`](../../lib/framework/facilitation/engine/published-graph.ts)). Import
  the specific module, not the barrel, in pure tests (B12).
- **Journey reads (canRead-guarded)** — `getJourney` / `getNodeStates` / `getJourneyTimeline`
  ([`facilitation/journey/queries.ts`](../../lib/framework/facilitation/journey/queries.ts)); the
  `JourneyViewer` / `AccessScope` / `canRead` seam
  ([`shared/access.ts`](../../lib/framework/shared/access.ts)).
- **Slot reads** — `getSlotHeads` (recency-ordered) + `getSlotGroupsScopes` (group/scope join)
  ([`data-slots/values.ts`](../../lib/framework/data-slots/values.ts) /
  [`queries.ts`](../../lib/framework/data-slots/queries.ts)); `SlotValue` fields (`confidence` 1–10,
  `capturedAt`, `valueJson`, `provenance.{moduleSlug,nodeKey}`).
- **Module liveness** — `isModuleLive(module, flags, now, entitlement?)`
  ([`modules/liveness.ts`](../../lib/framework/modules/liveness.ts)).
- **The capability seam** — `registerFrameworkCapability` / `registerFrameworkCapabilityHandlers` /
  `syncFrameworkCapabilities` ([`capabilities/registry.ts`](../../lib/framework/capabilities/registry.ts) /
  [`sync.ts`](../../lib/framework/capabilities/sync.ts)); `BaseCapability` +
  [`data-slots/capabilities/get-state.ts`](../../lib/framework/data-slots/capabilities/get-state.ts) as
  the read-cap template; `CapabilityContext` (`userId` nullable, `agentId`, `conversationId`, `scope`).
- **The context seam** — `registerContextContributor` / `invalidateContext`
  ([`orchestration/chat/context-builder.ts`](../../lib/orchestration/chat/context-builder.ts));
  `MODULE_CONTEXT_TYPE` + `loadModuleContext`
  ([`framework/modules/context.ts`](../../lib/framework/modules/context.ts)); registered in
  `initFramework()` ([`lib/framework/index.ts`](../../lib/framework/index.ts)).
- **Scope + bindings** — `encodeScope` / `decodeScope` / `SCOPE_KEYS`
  ([`shared/scope.ts`](../../lib/framework/shared/scope.ts)); `isInModuleScope`
  ([`modules/capabilities/namespace.ts`](../../lib/framework/modules/capabilities/namespace.ts));
  `ModuleAgentBinding.isPrimary` + `modules/bindings/queries.ts`; the core `streamChat` handler +
  `ChatRequest.scope` seam ([`orchestration/chat/streaming-handler.ts`](../../lib/orchestration/chat/streaming-handler.ts):1609).

## Test strategy (vitest — no live DB) — stated up front (B9)

vitest runs on `happy-dom` with **no live DB**; every DB/engine call is mocked:

- **`guidance.ts` ranking core** — a **pure** function over `(validMoves, perNode, slotHeads, now)`;
  unit-test recency/confidence weighting, reason strings, the empty `related` slot, deterministic
  ordering, and the low-confidence / recently-changed / declared-preference signals. Import the
  specific module (B12).
- **The assembler** — mock `getPublishedGraph` / `getNodeStates` / `getSlotHeads` / `isModuleLive` /
  `resolveJourneyNow`; assert it `canRead`-guards (a denied read → empty/guarded), builds the liveness
  map, and passes a well-formed `AvailabilityInput`.
- **The capabilities** — mock `guidance.ts` + journey queries + `applyEvent`; unit-test each
  `execute()`: `no_user_context` guard, the success payload shape, `processesPii` + `redactProvenance`
  masking slot content where applicable, and `request_transition` narrating an `applyEvent` `Rejection`
  without a DB write.
- **The context contributor** — mock the assembler/synopsis; assert `loadModuleContext` composes
  **one** body from module + journey + slots, and degrades to the scaffold string on a failing read.
- **Surface route + X5** — mock `streamChat` + the binding query; assert the route resolves the
  primary agent, sets `contextType`/`contextId`, and calls `streamChat` with `scope.moduleSlug`
  populated (the write that makes `isInModuleScope` enforce). Plus the **boundary test**: stripping the
  framework leaves `buildContext()` with one fewer contributor (proves the seam stayed clean).

## Tasks (promoted)

| ID   | Task                                                                                                                                                                                                                                                                                                                                                                                                                              | Files                                                                                                                                                      | Deps           | Status           | PR  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------- | --- |
| t-1  | **`guidance.ts` — assembler + ranking + synopsis (anchor).** `assembleAvailabilityInputs` (the seam the engine left open; canRead-guarded) + the pure recency-weighted ranking of `validMoves` (reasons + empty advisory `related` slot) + the linger/move focus call + the event-log progress-synopsis digest. No capabilities yet.                                                                                              | `lib/framework/guidance/guidance.ts`, `lib/framework/guidance/ranking.ts`, `tests/…`                                                                       | —              | backlog          | —   |
| t-2  | **The guidance read capability family.** `get_journey_state` · `get_next_steps` · `get_progress_synopsis` · `suggest_focus` — built-in `BaseCapability`s over `guidance.ts` + journey queries; `processesPii` where slot content surfaces; registered via the framework capability seam.                                                                                                                                          | `lib/framework/guidance/capabilities/{get-journey-state,get-next-steps,get-progress-synopsis,suggest-focus,index}.ts`, `lib/framework/index.ts`, `tests/…` | t-1            | backlog          | —   |
| t-3  | **`request_transition` — the write capability.** Over the engine's sole writer `applyEvent` (enter/complete); narrates the `Rejection` on refusal; no DB write on a refused move. Split from t-2 by the read/write boundary.                                                                                                                                                                                                      | `lib/framework/guidance/capabilities/request-transition.ts`, `tests/…`                                                                                     | t-1            | backlog          | —   |
| t-4  | **Module context injection (user-agnostic) + boundary test.** Enrich the `'module'` contributor to inject the module's name + description from the code registry (`getRegisteredModules`) — safe with core's per-`(type,id)` cache. The framework-strip boundary test on `buildContext()` (already proven by `boot.test.ts`). Per-user journey/slots injection split to **t-4b** (core-seam constraint — see decision 5).         | `lib/framework/modules/context.ts`, `tests/…`                                                                                                              | t-1            | in flight (John) | —   |
| t-4b | **Per-user context injection (deferred from t-4).** Inject the user's journey position + fresh slots into the `'module'` contributor body (via `loadGuidance` / `getSlotHeads`). **Blocked** on a Sunrise seam widening ([[upstream-asks]]): the contributor must receive `userId` and the `buildContext` cache must be user-aware, else per-user content leaks across users. Agents access this data via the t-2 caps meanwhile. | `lib/framework/modules/context.ts` (post-seam), `tests/…`                                                                                                  | t-4 + upstream | backlog          | —   |
| t-5  | **Surface-scoped conversations (X5).** A framework-owned chat route that opens a module surface with its bound primary agent, sets `contextType`/`contextId`, resolves resume, and **populates `scope.moduleSlug`** (`encodeScope`) — completing f-module-bindings' `isInModuleScope` enforcement. Coordinate with Simon (07).                                                                                                    | `app/api/v1/.../framework/**/route.ts`, `lib/framework/guidance/surface.ts`, `tests/…`                                                                     | t-4            | backlog          | —   |

**Sizing (B1 self-check): board's 5 indicative → 5 promoted, with one fold + one split.** The board's
t-5 "boundary test" is **commit-sized** → folded into **t-4** (the contributor task it verifies). The
board's t-2 "capability family (5 caps)" is **over the one-PR target at ~5×(cap+tests)** → **split by
the read/write boundary** into **t-2** (4 read caps) and **t-3** (`request_transition`, the write cap
over the engine's sole writer) — the same discipline that split f-slot-capture's `get_state`/`fill_slot`.
Net still 5 PRs. **t-1 is the anchor** (the assembler is the reused seam f-facilitation-agents inherits;
build it as its final shape). **t-5 depends on t-4** (a surface needs the enriched contributor to inject
context) and is the **coordination point with Simon's f-module-bindings** — sequence it last.

## Resolved design questions (2026-07-05)

The five refinement questions are settled here (no configurability shipped that a real requirement
hasn't yet demanded — each default keeps the layer pure, simple, and deletable):

1. **Ranking weights → a transparent, documented default; NOT a pluggable policy.** `ranking.ts`
   carries one weighting as named constants at the top of the module (recency of the node's most-relevant
   slot(s) · `confidence` 1–10 · a boost for low-confidence / recently-changed areas the node would
   clarify · the advisory `recommended_by` soft-deadline), each ranked option emitting its **reason
   string** so the ranking is auditable without a config surface. Tests assert **ordering behaviour**
   (e.g. "a recently-contradicted node outranks a stale one"), never magic coefficients — so the weights
   stay tunable without churning tests. A pluggable/authored ranking **policy** is deferred to
   `f-policies` (17) _if a real need appears_; shipping the hook now is the premature abstraction
   keep-it-simple forbids.
2. **`get_progress_synopsis` → a deterministic, pure digest. The agent narrates; guidance never calls an
   LLM.** The synopsis is a structured digest of the event log (milestones reached, recent transitions,
   open/untouched regions, counts) computed purely from `getJourneyTimeline` + `getNodeStates` — testable,
   reproducible, and true to the layer's discipline (_engine + guidance are pure; agents narrate_).
   Prose richness lives at the **narration** layer (the agent renders the digest), so determinism costs
   nothing in expressiveness — and we avoid re-importing f-slot-capture t-3b's provider-resolution
   friction into a layer that has no reason to be non-deterministic.
3. **Interim scope posture → LEAVE `isInModuleScope` allow-on-absent (decision 7). Locked.** t-5
   populating `scope.moduleSlug` makes the merged predicate enforce for module surfaces naturally; a
   global refuse-on-absent flip is a **governance** call (`f-policies` 17) and would break Simon's t-2
   tests. Not this feature's to make — coordinate, don't flip.
4. **Surface route → one generic framework-owned proxy route (decision 6).** `POST
…/framework/surface/{moduleSlug}/chat` resolves the bound primary agent, does the resume lookup
   (decision 8), and proxies to core `streamChat` with `scope` populated. Chosen over the thinner
   "open→return handles" variant precisely because it keeps the **scope write entirely framework-side** —
   the lighter variant would eventually need the **core** consumer route to forward `scope` (a forbidden
   core edit). One route, one boundary, zero core change.
5. **`request_transition` confirm-first → out of scope; achieved with the existing read caps. No
   `dryRun`.** `request_transition` stays the pure write mechanism. An agent that wants to confirm first
   calls **`get_next_steps`** (which already returns the eligible moves + reasons — a natural preview),
   confirms with the user, then calls `request_transition`. A separate `dryRun`/preview mode would just
   duplicate `get_next_steps`, so it is not built.

## Upstream-asks candidates (fork-first — ledger at build)

- **Consumer chat scope carrier.** X5 shadows the consumer chat route only because
  `consumerChatRequestSchema` / `app/api/v1/chat/stream/route.ts` can't carry `scope` (core-owned).
  Propose Sunrise let the consumer schema accept a validated opaque `scope` map, after which the
  framework route needn't shadow the core one. Ledger against the same seam as f-module-bindings' scope
  work.
- **Surface conversation resume by `(contextType, contextId)`.** The framework-side most-recent-active
  lookup (decision 8) exists only because core resume is `conversationId`-only. Propose a core
  find-or-resume-by-context option so surfaces needn't reimplement it.
