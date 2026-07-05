---
name: f-slot-capture
feature: 10 · f-slot-capture
epic: Framework v1
status: in flight (t-1 available · t-2/t-3/t-4 backlog)
owner: John
depends_on: f-slots (shipped — #19 / #22 / #24, for `appendSlotValue` / `getSlotHeads` / slot definitions + vocabulary) · f-journey-state (shipped — #27 / #28, for `canRead` — the read guard `getSlotHeads` deliberately left off)
spec: framework-architecture.md §6.1 (slot values + provenance) · §6.2 (capture) · §7 (scope) + Appendix A (D5 silent tool-loop capture · X1 free-string vocab · X2 `canRead`) · Sunrise #307 (enforced structured output)
parent: plan.md
opened: 2026-07-05
---

# f-slot-capture — the capture capabilities

> Feature-level build plan for **`f-slot-capture`**, the two agent capabilities that
> read (`get_state`) and write (`fill_slot`) a user's data-slots silently in the chat
> tool loop (D5). Parent: [[plan#10 · `f-slot-capture` — capture capabilities|plan.md]].
> Binding _how_: [[framework-architecture#6. Data-Slots|spec §6]] (the value engine
> this wraps) + Appendix A — **D5** (silent capture riding the existing tool loop),
> **X2** (`canRead` on every slot read), **X1** (free-string vocab: `sensitivity` /
> `sourceType`), and Sunrise **#307** (a Zod/JSON schema enforced as LLM structured
> output). Sizing follows the parent plan: **task = one PR** (~200–600 lines).

## Intent

`f-slots` (shipped) is the mechanical value engine — `appendSlotValue` (insert-only,
versioned) and `getSlotHeads` (the current picture), plus slot definitions + the
classifier vocabulary. It ships **no writer of real captures and no reader an agent
can call**: `values.ts` and `data-slots/index.ts` both name **`f-slot-capture` as the
owner** of `get_state` / `fill_slot`. This feature is that owner — the two
`BaseCapability` tools an agent invokes, silently, mid-conversation (D5): `get_state`
to read what's known about the user (guarded by `canRead`, X2), `fill_slot` to
validate + persist a new reading (with sensitivity-driven masking and #307-enforced
typed extraction). It is the capture half of the slot subsystem, and the **last
blocker on `f-guidance` (12)** — the head of the remaining critical path.

The closest shipped analog is `lib/orchestration/capabilities/built-in/user-memory.ts`
(a read cap + a write cap, both `processesPii`, DB-backed, scoped to `context.userId`)
— f-slot-capture is the same shape over the slot engine instead of `AiUserMemory`.

## What ships here, and what deliberately does not

**In scope.** `get_state` + `fill_slot` `BaseCapability`s over the shipped slot engine;
the `canRead` guard on the read; targeted-slug validation + open-mode slug minting;
P2002 retry; `processesPii` + `redactProvenance`; sensitivity-driven
masking-before-storage; #307-enforced typed extraction; per-agent read/write exposure
via grant `customConfig`; and the **framework capability-registration seam** wiring
these non-module framework tools into the orchestration dispatcher + `AiCapability`
rows at boot.

**Out of scope** (owned elsewhere, so no dead surface lands early):

- **Guidance ranking / context injection** — reading slots to _rank_ what to surface,
  and injecting them into the prompt, is **`f-guidance` (12)**. This feature ships the
  raw `get_state` read; guidance decides what to _do_ with it.
- **Slot admin UI** (definitions, values browser) → `f-ops-views` (15). This is
  backend capabilities only (API-first; §6 backend).
- **Cohort / cross-subject reads** (a facilitator reading a subject's slots) → the
  parked §8 relationship overlay. `get_state` reads the **caller's own** slots today;
  the `canRead(viewer, subject, scope)` seam is what makes §8 a later policy change,
  not a rewrite (X2).
- **The module-lifecycle event stream / stats** → `f-engagement` (08). This feature
  reads/writes slots, not engagement events.
- **Slot definitions themselves** — declared by modules (`f-module-core`/`f-slots`);
  `fill_slot` _consumes_ definitions (validate/mint), it does not author them.

## Reconciliation with current repo reality — the design decisions

Organising principle, carried from [[f-engine]] / [[f-journey-state]]: **ship nothing a
fork has to delete**, and **follow the shipped code, not the rev-16 spec sketch**.
Every "assumed landed" precedent is verified against the tree (§ anchors in _Reuse
anchors_). Decisions (2026-07-05):

1. **The capabilities live in `lib/framework/data-slots/capabilities/`** (`get-state.ts`,
   `fill-slot.ts`), fork-owned `BaseCapability` subclasses — the shipped `values.ts`
   header + `data-slots/index.ts` already earmark f-slot-capture as their owner. Mirror
   `built-in/user-memory.ts` (read + write cap, `processesPii`, `redactProvenance`,
   `context.userId`-scoped). `BaseCapability` (`lib/orchestration/capabilities/base-capability.ts`)
   is a Sunrise-core **public base class**; subclassing it from framework code is
   framework→core through a public seam, not a core edit.
2. **`get_state` calls `canRead` before `getSlotHeads`** (the guarding path
   f-journey-state _documented_ on the shipped engine, X2). `getSlotHeads` takes a bare
   `userId` and is **not** `canRead`-wrapped by design ([`access.ts`](../../lib/framework/shared/access.ts)
   header + [`values.ts`](../../lib/framework/data-slots/values.ts) both say so) — the
   capability supplies the guard: build a `JourneyViewer` from `context.userId`, call
   `canRead(viewer, subject, scope)`, and only then `getSlotHeads(subject)`. Today
   `subject === context.userId` (own slots) → allow; the seam composes with #366/#367
   for §8 cohort-facilitator reads later. A denied read returns empty (no throw — a
   capability returns a structured result), never another user's heads.
3. **`fill_slot` writes the caller's own slots** (`context.userId` → `appendSlotValue.userId`)
   — a user fills their own slots, so there is no cross-user write and no `canRead` on
   the write path. It **validates the target slug against `SlotDefinition`** (targeted
   mode — the slug must be a defined, active slot) or **mints an open-mode slug** (open
   mode); `appendSlotValue` deliberately does **not** validate `slotSlug`
   ([`values.ts`](../../lib/framework/data-slots/values.ts) — "not validated here; that
   is `fill_slot`'s job") and `SlotValue.slotSlug` is not an FK, so this is the
   capability's job. **P2002 retry:** `appendSlotValue` does not retry a concurrent
   same-slug append (the `@@unique([userId, slotSlug, version])` backstop makes the loser
   throw P2002); `fill_slot` catches P2002 and re-runs (the fresh head yields the next
   version) — the retry the engine intentionally left to the caller.
4. **A framework-standalone capability-registration seam — net-new, and the reusable
   piece `f-guidance` (12) inherits.** The shipped capability-registration path
   (`registerRegisteredModuleCapabilities` / `syncRegisteredModuleCapabilities`) is
   **module-scoped**: it iterates registered modules and namespaces each tool
   `<module>__<tool>`. `get_state` / `fill_slot` are **global framework tools owned by
   no module**, so they don't fit that path (no module declares them; they'd get an
   unwanted prefix). Add a **new pass in `syncFramework()`**
   ([`lib/framework/index.ts`](../../lib/framework/index.ts) — its header says "later
   features add their own passes here"): (a) `capabilityDispatcher.register(new
GetStateCapability())` / `FillSlotCapability()` for the in-memory handler (the core
   dispatcher's **public** `register()`, already called by the module path — no core
   edit), and (b) a small `ai_capability`-row sync (analogous to
   `syncRegisteredModuleCapabilities`) so agents can be granted them via
   `AiAgentCapability`. Build it as a generic `registerFrameworkCapability(...)` + sync
   helper — the first non-module framework built-ins — so `f-guidance`'s capabilities
   reuse it (the `f-map`-ships-`version-service`-for-`f-engine` pattern). These rows are
   framework built-ins present in every fork (like Sunrise's built-in capabilities), not
   strippable demo data.
5. **`processesPii = true` + `redactProvenance` on both** — the dispatcher throws at
   `register()` for a PII cap that doesn't override `redactProvenance`
   ([`dispatcher.ts`](../../lib/orchestration/capabilities/dispatcher.ts)). Mirror
   `user-memory.ts`: mask the slot `value` in the persisted provenance audit row via
   `redactedString` / `maskKeysInObject` ([`lib/security/redact.ts`](../../lib/security/redact.ts)).
   This is **audit-row** redaction (what the trace stores) — a different axis from
   value-masking-before-storage (decision 6).
6. **Sensitivity-driven masking-before-storage — net-new (t-3), semantics flagged for
   the owner.** No sensitivity-keyed masking exists anywhere (only the `SLOT_SENSITIVITY`
   key — `standard | sensitive | special_category` — and the generic `redact.ts`
   primitives). A pure `slotMaskingPolicy(sensitivity, { value, valueJson })` seam,
   strictest for `special_category`. **Open decision (Ultraplan):** what
   "masking-before-storage" actually stores — (a) store the plain `value`
   masked/summarised for `special_category` while the typed `valueJson` holds only the
   gate-relevant form (gates work without persisting raw special-category prose), or (b)
   a per-sensitivity exposure policy (store raw, mask on read). Proceeding with the
   `slotMaskingPolicy` seam + a defensible default; the exact stored form is the owner's
   call.
7. **`fill_slot` #307-enforced typed extraction — net-new mapping (t-3).** The
   enforcement mechanism exists at the LLM layer (`runStructuredCompletion` /
   `responseFormat: { type: 'json_schema' }` — [`evaluations/parse-structured.ts`](../../lib/orchestration/evaluations/parse-structured.ts)),
   but there is **no `dataType → JSON-Schema` mapping and no zod↔json-schema bridge
   in-repo**. Build a small `SLOT_DATA_TYPE → JSON Schema` map (`text→string`,
   `number→number`, `boolean→boolean`, `date→string+format`, `json→object`) and forward
   it as the enforced `responseSchema`. **Open decision:** whether `fill_slot` runs a
   _secondary_ structured extraction (LLM extracts the typed `valueJson` from the source
   per the schema) or the agent's tool-call arguments already carry the typed value —
   proceeding with "agent supplies `value` (+ optional `valueJson`); the typed form is
   validated against the `dataType` schema, and where the source is prose a structured
   extraction fills it," exact split a t-3 detail. Note `runStructuredCompletion` lives
   under `evaluations/` — reusing it cross-domain is a framework→orchestration public
   import, or it moves to a shared LLM util (confirm at t-3).
8. **Per-agent read/write exposure via grant `customConfig` — t-4, avoids a core edit.**
   `AiAgentCapability.customConfig` exists ([`orchestration-agents.prisma`](../../prisma/schema/orchestration-agents.prisma))
   but the dispatcher **never reads it** (`getAgentBinding` consumes only `isEnabled` +
   `customRateLimit`). So "which groups/scopes an agent may read/write, enforced inside
   the capability" needs the binding's `customConfig` at execute time. Two paths: (a) the
   dispatcher surfaces `customConfig` into `CapabilityContext` (a **Sunrise-core
   dispatcher edit** → an upstream ask), or (b) **the capability re-reads its own
   `AiAgentCapability` row** (framework reading a core model via `prisma` — no core edit,
   the module-bindings pattern). Proceeding with **(b)** to stay pure framework-tier;
   **owner to confirm** — if (a) is preferred, it's a small Sunrise issue + an
   [[upstream-asks]] row.
9. **Silent in conversation (D5).** Captures ride the tool loop silently — no
   user-visible follow-up turn. `estimate-cost.ts` sets `skipFollowup` on its
   `CapabilityResult`; `get_state` / `fill_slot` do the same so a capture doesn't
   surface as a chat message.

## Reuse anchors found in-tree

- **`BaseCapability`** — `lib/orchestration/capabilities/base-capability.ts` (the abstract
  class: `slug`, `functionDefinition`, Zod `schema`, `processesPii`, `redactProvenance`,
  `execute`, `success`/`error` helpers). **`built-in/user-memory.ts`** is the read+write,
  `processesPii`, `context.userId`-scoped template to copy.
- **The dispatcher + registry** — `capabilityDispatcher.register()` /
  `dispatch()` (`lib/orchestration/capabilities/dispatcher.ts`), `getCapabilityDefinitions`
  (`registry.ts`, the chat loop's tool source). The module capability path
  (`modules/capabilities/{register,sync,namespace}.ts`) is the framework-side precedent
  for registering handlers + syncing `ai_capability` rows — mirror it, minus the
  `<module>__` namespacing.
- **The slot engine** — `appendSlotValue` / `getSlotHeads` +
  `AppendSlotValueInput` / `SlotValueProvenance` ([`data-slots/values.ts`](../../lib/framework/data-slots/values.ts));
  `listSlotDefinitions` ([`data-slots/queries.ts`](../../lib/framework/data-slots/queries.ts));
  the `SLOT_SENSITIVITY` / `SLOT_SOURCE_TYPE` / `SLOT_DATA_TYPE` / `SLOT_MODE` vocab
  ([`data-slots/vocabulary.ts`](../../lib/framework/data-slots/vocabulary.ts)).
- **The access seam** — `canRead` / `subjectScope` / `JourneyViewer`
  ([`shared/access.ts`](../../lib/framework/shared/access.ts)); the guarding-path contract
  is documented there and in `values.ts`.
- **Structured output (#307)** — `runStructuredCompletion` + `LlmResponseFormat`
  (`lib/orchestration/evaluations/parse-structured.ts`, `lib/orchestration/llm/types.ts`).
- **Redaction primitives** — `redactedString` / `maskKeysInObject`
  ([`lib/security/redact.ts`](../../lib/security/redact.ts)).
- **The boot seam** — `syncFramework()` ([`lib/framework/index.ts`](../../lib/framework/index.ts)),
  the aggregate async boot step where the new registration pass slots in.

## Test strategy (vitest — no live DB) — stated up front (B9)

vitest runs on `happy-dom` with **no live DB**. Every DB/LLM test here:

- **The capabilities** — mock `@/lib/db/client` and the slot engine (`appendSlotValue` /
  `getSlotHeads` / `listSlotDefinitions`) and `canRead`; unit-test `execute()` paths:
  `get_state` calls `canRead` **before** `getSlotHeads` (denied → empty, no read),
  returns the heads; `fill_slot` targeted-validate (unknown slug → error), open-mint,
  **P2002 → one retry**, `appendSlotValue` called with the right shape. Assert
  `processesPii` and that `redactProvenance` masks the `value`.
- **`slotMaskingPolicy` + the `dataType → JSON-Schema` map** — pure units.
- **Structured extraction** — mock `runStructuredCompletion`; assert the slot's schema is
  forwarded as the enforced `responseSchema`.
- **The registration seam** — a stateful in-memory dispatcher + mocked-prisma test
  proving `syncFramework()` registers the two handlers and syncs their `ai_capability`
  rows (idempotent).
- **`customConfig` exposure** (t-4) — unit-test the allowlist: a group/scope outside the
  grant is refused inside the capability.

Never "integration test against the dev DB" in vitest; a `smoke:*` script proves any
real-DB append if the mocked units leave a gap (mirroring `smoke:engine`).

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                            | Files                                                                                                                                 | Deps | Status    | PR  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | --- |
| t-1 | **Framework capability-registration seam + `get_state`.** The generic non-module framework-capability register + `ai_capability` sync wired into `syncFramework()`, proven by `get_state` (`canRead` → `getSlotHeads`, `processesPii`, silent). | `lib/framework/data-slots/capabilities/{get-state,index}.ts`, framework-capability register/sync, `lib/framework/index.ts`, `tests/…` | —    | available | —   |
| t-2 | **`fill_slot` (the write cap).** Targeted-slug validation / open-mode minting / P2002 retry / `appendSlotValue`; `processesPii` + `redactProvenance`; silent (D5).                                                                              | `lib/framework/data-slots/capabilities/fill-slot.ts`, `tests/…`                                                                       | t-1  | backlog   | —   |
| t-3 | **Sensitivity masking + #307 typed extraction.** `slotMaskingPolicy` (special_category strictest) applied before storage; `SLOT_DATA_TYPE → JSON-Schema` forwarded to `runStructuredCompletion`.                                                | `data-slots/capabilities/{masking,extract}.ts`, `tests/…`                                                                             | t-2  | backlog   | —   |
| t-4 | **Per-agent read/write exposure via grant `customConfig`.** The capability reads its `AiAgentCapability.customConfig` (which groups/scopes it may read/write) and enforces it.                                                                  | `data-slots/capabilities/{get-state,fill-slot}.ts`, `tests/…`                                                                         | t-1  | backlog   | —   |

**Sizing (B1 self-check): 3 indicative → 4 promoted (SPLIT, owner to confirm).** The
board's indicative t-1 bundles _both_ capabilities + the (net-new) framework
registration infra — comfortably over one PR. Split it: **t-1** ships the reusable
registration seam + the simpler read cap (`get_state`); **t-2** ships the write cap
(`fill_slot`), whose validate/mint/retry mechanics are a PR on their own. t-3 (masking +
extraction) and t-4 (exposure) are the board's t-2/t-3. t-4 depends only on t-1 (the
caps exist by then) and can parallelise. This mirrors [[f-engine]]'s B1 right-sizing (in
reverse — a split, not a fold) — the point is one-PR tasks, not a fixed count.

## Boundary & forkability notes

- **Pure framework-tier — one open upstream question.** All new code lives in
  `lib/framework/data-slots/capabilities/**` + the framework registration pass. It
  consumes the core capability dispatcher's **public** `register()` (already called by the
  module path), subclasses the public `BaseCapability`, and writes core `AiCapability` /
  reads `AiAgentCapability` via the shipped models (as `f-module-bindings` does) — **no
  core edit**. The **one** possible upstream ask is decision 8 (surfacing binding
  `customConfig` into `CapabilityContext`), deferred by reading the binding in-capability;
  if reversed, file a Sunrise issue + an [[upstream-asks]] row.
- **Leaf surface stays reserved-empty.** No `lib/app/*`; a leaf gets `get_state` /
  `fill_slot` for free at boot and grants them to its agents.
- **No migration.** `SlotValue` / `SlotDefinition` (f-slots) + `AiCapability` /
  `AiAgentCapability` (core) already exist; this is code + boot-sync only — no
  `framework_*` migration, so the pgvector/tsvector strip (B13) does not apply.
- **Ship nothing a fork strips.** The two capabilities are framework built-ins (like
  Sunrise's), proven by `tests/`; a fork boots with them registered but grants them to no
  agent until it chooses to.

## Open questions

- **Masking-before-storage semantics (decision 6).** What `special_category` actually
  stores — masked `value` + gate-only `valueJson`, vs store-raw + mask-on-read.
  Proceeding with the `slotMaskingPolicy` seam + a default; owner to confirm the stored
  form.
- **Structured-extraction split (decision 7).** Secondary extraction call vs
  agent-supplied typed value; and whether `runStructuredCompletion` moves out of
  `evaluations/` to a shared LLM util. Owner to confirm at t-3.
- **`customConfig` surfacing (decision 8).** In-capability binding read (no core edit,
  recommended) vs a dispatcher `CapabilityContext` addition (upstream ask). Owner to
  confirm.
- **Sizing 3 → 4 (split).** Proceeding with the split (t-1 registration+get_state · t-2
  fill_slot); owner to confirm, or keep both caps in t-1 if the registration seam turns
  out light.

## Done when (feature)

`get_state` reads the caller's slots behind `canRead` (denied → empty), and `fill_slot`
validates-or-mints a slug, applies sensitivity masking, extracts the typed value under
#307 enforcement, and appends the next version (P2002-retried) — both `processesPii`
with a `value`-masking `redactProvenance`, both silent in the tool loop (D5), both
grantable per-agent with `customConfig` read/write scoping; all registered into the
dispatcher + `AiCapability` rows by a **reusable framework capability-registration seam**
`f-guidance` inherits; the whole path proven by mocked-prisma/LLM units + the
registration-seam test — **with a fresh fork booting the two built-ins registered,
granted to no agent, nothing to strip.** Pure framework-tier (the one possible upstream
ask deferred by an in-capability binding read). On the last merge: flip `f-slot-capture`
→ **shipped**, flip **`f-guidance` (12)** from `blocked → available` (its last blocker
clears), add a Work-completed log line, and append execution lessons to [[planning-retro]].

## References

- [[plan#10 · `f-slot-capture` — capture capabilities|plan.md feature 10]] — parent.
- [[framework-architecture#6. Data-Slots|spec §6]] (the slot subsystem) + Appendix A (D5
  silent capture · X1 free-string vocab · X2 `canRead`) + Sunrise #307 (structured output).
- [[f-slots]] — the value engine (`appendSlotValue` / `getSlotHeads` / definitions /
  vocab) this wraps, and the `getSlotHeads`-unguarded / `slotSlug`-unvalidated seams it fills.
- [[f-journey-state]] — `canRead`, the read guard the shipped engine documented for this
  feature to supply.
- [[f-module-bindings]] — the sibling capability-adjacent feature (the `AiAgentCapability`
  pivot + `customConfig`, the namespaced module-capability registration this generalises).
- [[planning-retro]] — process lessons applied (B1 sizing, B4 gates-in-done-when, B9
  vitest-no-live-DB, B12 pure/DB module split); fold new lessons back on close-out.
