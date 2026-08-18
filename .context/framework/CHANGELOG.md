# Daybreak changelog

All notable changes to the **Daybreak framework** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) — see
[`VERSIONING.md`](./VERSIONING.md) for the public-surface contract and the release
process.

> **This is Daybreak's changelog, not Sunrise's.**
> [`../../CHANGELOG.md`](../../CHANGELOG.md) at the repo root is **Sunrise's** and
> describes the platform. A leaf reads **both**: this file for framework changes,
> that one for platform changes Daybreak carries through.
>
> Changes Daybreak merely inherits unchanged from a Sunrise sync do **not** get an
> entry here — they are already in Sunrise's changelog, and duplicating them would
> dilute the signal. What _does_ get an entry is anything the sync changed about
> **the leaf's contract with Daybreak** (see `0.1.0` below for exactly that case).

> **Status: `0.x` alpha.** The strict SemVer contract activates at `1.0.0`. During
> `0.x`, leaf forks should expect real merge work between any two releases. See
> [`VERSIONING.md`](./VERSIONING.md#0x-semantics--loose-by-design).

---

## [Unreleased]

### Removed

- **`npm run framework:sync-ancestry`** and its `app:ci-checks` entry, together
  with `scripts/release/sync-ancestry.ts`, `sync-ancestry-check.ts` and their unit
  tests. Sunrise 0.9.0 landed the seam this shim stood in for (Sunrise #539) as the
  [`Fork Sync Integrity`](../../.github/workflows/fork-sync-integrity.yml)
  workflow, so the fork stops carrying its own.

  **Leaf-visible, no action required — but read this if your leaf pinned it.** A
  leaf invoking `framework:sync-ancestry` directly must switch to the workflow,
  which ships in the same merge. The trigger changes: the npm guard ran on every
  CI job, the workflow runs on **push to `main`**. That is the right trigger for a
  leaf as well as for Daybreak — and, unlike the shim, the workflow resolves its
  upstream through `SUNRISE_UPSTREAM_URL` instead of hardcoding Sunrise's clone
  URL, which is what a fork of Daybreak actually needs. **Leave that variable
  unset unless Sunrise's tags are genuinely unreachable** — see
  [`CUSTOMIZATION.md` §9](../../CUSTOMIZATION.md) for the trap it opens.
  ([`upstream-asks.md`](./upstream-asks.md) — Sunrise #539.)

### Fixed

- **Module registrations now survive the request realm** — `registerModule()` /
  `getRegisteredModule()` (`lib/framework/modules/registry.ts`) and
  `registerFrameworkCapability()` / `getRegisteredFrameworkCapabilities()`
  (`lib/framework/capabilities/registry.ts`) are backed by `globalThis`.

  **Leaf-visible fix, no action required.** Next 16 + Turbopack loads
  `instrumentation.ts` in a different module graph from route handlers and RSC, so
  a registry populated at boot was empty on every request. A correctly registered,
  active, DB-synced module rendered _"This module's code is no longer registered,
  so its config can't be edited"_ — the whole generic module-config surface was
  dead for any leaf module. If your leaf carries a local `keep-mine` copy of either
  registry to work around this, you can drop it on merging this release.
  (Daybreak #160; same class as Sunrise #462, which swept core's own registries.)

- **Map publish listeners now fire on the request path**
  (`registerMapPublishListener()` / `notifyMapPublished()`,
  `lib/framework/facilitation/map/publish-hooks.ts`) — same `globalThis` fix, same
  root cause. The seam registers at boot but fires from the admin publish/rollback
  routes, so `autoEmbedAfterPublish` never ran after a real publish and overlay
  embeddings went stale with no error and no log.

  > **Scope — this fixes Daybreak's own registries, not the whole class.** Four
  > **Sunrise-owned** registries have the same split and the framework registers
  > into all of them at boot: the workflow `executor-registry`, and the
  > agent-access, guard-floor and guard-event contributors. Until those are backed
  > upstream, framework workflow step types throw _unknown step type_, and module
  > knowledge scope, facilitation guard minimums and escalation silently no-op on
  > the request path. They cannot be fixed from a fork without editing core; each
  > is tracked in
  > [`upstream-asks.md`](./upstream-asks.md) as a Sunrise #462 follow-on.

### Added

- **`npm run framework:sync-ancestry`, wired into the fork-owned `app:ci-checks`
  seam** — fails the build when `lib/sunrise-version.ts` claims a Sunrise release
  that is not in the tree's git history, the signature of a squash-merged sync PR
  that silently resets the fork's merge base.

  **Leaves inherit this check.** It compares the *claimed* version against history
  — never against the newest upstream release — so being deliberately behind
  upstream stays silent.

  The check **bootstraps its own refs**: a CI runner (or a leaf clone) has none of
  Sunrise's `vX.Y.Z` tags and checks out at depth 1, so it adds the `upstream`
  remote, fetches the tags, and deepens a shallow clone before answering.
  Deepening matters most — on a depth-1 clone `HEAD` has no parents, so an
  un-deepened check would call *every* release a violation. If those refs cannot be
  fetched (offline runner, blocked egress) it skips loudly rather than accusing the
  tree of a violation it could not observe. On a machine that already has the tags
  and full history it is a no-op and touches no git config. (Sunrise #539.)

### Changed

- **The slot capabilities read their per-agent exposure allowlist from the execution
  context instead of re-querying the grant** — `loadExposureConfig(agentId, slug)` in
  `lib/framework/data-slots/capabilities/exposure.ts` is replaced by the pure
  `resolveExposureConfig(context, slug)`. `get_state` and `fill_slot` behave the same
  for every existing grant; one indexed `AiAgentCapability` lookup disappears from every
  slot capture and every state read.

  Sunrise 0.7.0 surfaced the resolved binding's `customConfig` onto `CapabilityContext`
  (#411), which is the value this shim was fetching for itself a few milliseconds after
  the dispatcher had already fetched it.

  **Two consequences worth knowing if you edit allowlists at runtime.** The config now
  shares the dispatcher's per-agent binding cache (5-minute TTL). The admin binding routes
  call `capabilityDispatcher.clearCache()` on every write, so a **single-instance**
  deployment applies an allowlist edit immediately. On a **multi-instance** deployment,
  `clearCache()` only clears the process that served the request — instances that did not
  serve it keep the previous allowlist for up to 5 minutes. The per-execute database read
  this replaces had no such window, so if you narrow an allowlist to cut off access, budget
  for that delay (or disable the binding, which has the same window, or restart the
  instances). This is the window `isEnabled` and `customRateLimit` already had; the
  fine-grained allowlist now shares it. Cross-instance invalidation is core-owned and filed
  in [`upstream-asks.md`](./upstream-asks.md).

  And a capability executed **outside** the dispatcher
  (no resolved binding on the context) now fails closed with `invalid_exposure` rather
  than treating the missing allowlist as permissive; nothing in Daybreak or Sunrise
  executes a capability that way, but a leaf calling `execute()` directly would see it.

  One narrowing in the other direction: a `customConfig` that is not a JSON **object**
  (an array or a scalar) is collapsed to `null` by the dispatcher before the capability
  sees it, so it now reads as "no allowlist" where the direct column read rejected it.
  The admin binding routes and the config import both validate the field as an object, so
  this only bites a leaf that writes the column by hand — write `{}`, not `[]`.

- **Slot prose→typed extraction is tagged `slot-extraction` in traces**
  (`lib/framework/data-slots/capabilities/extract.ts`) — it inherited the structured
  runner's default `evaluation` phase, so every extraction was filed under evaluation
  work in the OTEL span tree. Sunrise 0.7.0 widened `phase` to an open string (#410).
  Spans only: the runner persists nothing by contract, so this changes no cost record.

- **Module-declared capabilities are registered as themselves, through the core seam,
  instead of being wrapped** — `lib/framework/modules/capabilities/namespace.ts` no longer
  exports `namespaceModuleCapability` (and the `NamespacedModuleCapability` class is gone).
  It exports two pure derivations instead: `moduleCapabilityIdentity(moduleSlug,
  capability)` → `{ slug, functionDefinition }`, and `moduleScopeGuard(moduleSlug)` → a
  `CapabilityGuard`. `register.ts` passes them to
  `capabilityDispatcher.register(capability, { slug, guard })` (Sunrise #398, landed in
  0.7.0); `sync.ts` reuses the identity for the `ai_capability` row, so the handler key and
  the row's slug still come from one derivation.

  **Module authors: one authoring constraint is now stricter.** You still write an ordinary
  `BaseCapability` with a bare snake_case slug, still registered as
  `<module_slug>__<tool_slug>` with a matching `functionDefinition.name`. But if your
  capability sets `processesPii = true`, its `redactProvenance()` must be a **method on that
  class's own prototype**. Core's check is an own-property lookup on the instance's direct
  prototype, where the framework's deleted re-assertion compared by identity against the base
  method and so accepted anything. Two shapes that used to register are now **refused** — the
  boot still succeeds (registration is fail-soft; see the next entry), but the capability is
  absent from every agent's toolset and its `ai_capability` row is deactivated:

  ```ts
  // ❌ inherited from an intermediate base class
  abstract class ModuleToolBase extends BaseCapability {
    override redactProvenance() { … }
  }
  class GrabEmail extends ModuleToolBase { processesPii = true }

  // ❌ class-property arrow — an own *instance* property, not on the prototype
  class GrabEmail extends BaseCapability {
    processesPii = true;
    override redactProvenance = () => ({ … });
  }

  // ✅ a method on the capability's own class
  class GrabEmail extends BaseCapability {
    processesPii = true;
    override redactProvenance() { … }
  }
  ```

  **Check your module capabilities before upgrading.** Nothing crashes: the boot is healthy,
  the app serves traffic, and the only signal is a `logger.error` line reading
  `capability rejected — skipping`. Grep for it after upgrading rather than waiting for
  someone to notice a tool that stopped answering. Both shapes are pinned by
  tests, and core's over-strict check is filed in [`upstream-asks.md`](./upstream-asks.md);
  if Sunrise relaxes it, this constraint relaxes with it.

  **Two visible changes if you assert on refusals.** An out-of-module call is now refused
  by the dispatcher *before* the rate limiter (so it consumes no token) and comes back as
  core's `capability_guard_denied` rather than the framework's `out_of_module_scope`; the
  message names the module the same way. And the framework's own `redactProvenance`
  re-assertion is gone — core's PII guard now inspects your capability's real prototype
  instead of a wrapper that defeated it, so the contract is enforced in one place rather
  than two. A `processesPii` module capability that does not override `redactProvenance()`
  is still refused — it gets no handler, rather than taking the boot down with it.

- **Module slugs are now validated where the namespaced tool name is derived.** A module
  slug must be alphanumeric words joined by **single dashes**; an underscore (`read_ing`),
  a double dash (`read--ing`), or any character outside `[A-Za-z0-9-]` is refused.

  `registerModule()` never validated slugs, so the namespacing rule's "collision-free by
  construction" was a claim about a leaf's discipline rather than a property of the code.
  Modules `read-ing` and `read_ing` both declaring a tool `x` derive the *same*
  `read_ing__x`: the second registration silently replaces the first's handler and one
  module's tool becomes permanently non-dispatchable, with a single `ai_capability` row
  advertising it. A slug with a space or a dot produces a name no provider accepts.

  Uppercase is deliberately still allowed — `Reading__save_worksheet` is a legal tool
  name, so refusing it would break a working leaf for no safety gain. A violating module's
  capabilities are logged and skipped (see the next entry), not fatal.

- **A rejected module capability no longer takes the whole framework down with it.**
  `registerRegisteredModuleCapabilities()` is now fail-soft per capability: one that core
  refuses is logged at `error` and skipped, and its siblings still register.

  Previously the throw escaped into `syncFramework()`, whose caller (`lib/app/bootstrap.ts`)
  catches and logs — so a single bad capability skipped **every later boot step**: framework
  capability handlers never registered, and the module, slot and capability syncs never ran.
  The app served traffic looking healthy with no framework capabilities at all, on the
  strength of one log line. One author's broken tool is not a reason to unregister everyone
  else's.

  `syncRegisteredModuleCapabilities()` follows through: it writes rows only for capabilities
  that actually have a registered handler, so a refused capability's `ai_capability` row is
  deactivated rather than left advertising — and admin-grantable as — a tool that can never
  dispatch. If **no** declared capability has a handler, the sync skips entirely rather than
  mass-deactivating, the same reasoning as the existing zero-modules guard.

  **If you imported `namespaceModuleCapability`** (it was exported from
  `lib/framework/modules/capabilities`), switch to `moduleCapabilityIdentity` +
  `moduleScopeGuard`, or better, let `registerRegisteredModuleCapabilities()` do it.

- **Both framework chat surfaces resume through core's `findResumableConversation`**
  (`lib/framework/guidance/surface.ts`, `lib/framework/facilitation/agents/surface.ts`) —
  each hand-rolled the same `aiConversation.findFirst` on
  `(userId, agentId, contextType, contextId, isActive)`. Same query, same result; the
  `userId` scoping that keeps one user's surface conversation out of another's is now
  derived in one place (Sunrise #416, landed in 0.7.0). No API change — `ModuleSurface` /
  `FacilitationSurface` still declare `conversationId: string | undefined` (a required
  property that may be undefined, not an optional one).

### Documentation

- **The two framework surface stream routes now say why they exist.** Their headers
  attributed the shadow to "the core consumer route/schema can't carry `scope`" — true when
  written, stale since Sunrise #415 added `scope` to `consumerChatRequestSchema`. The real
  reasons never involved `scope`: the agent is **server-resolved** from the module binding
  or role (and visibility-gated), the conversation is tagged
  `contextType`/`contextId` — which the core consumer route deliberately refuses as an
  admin-only concept, and which resume looks up — and the module route emits
  `module.entered`. **A leaf should not read those routes as scaffolding to delete.** The
  remaining upstream ask is now filed honestly: a consumer entry point that accepts a
  server-resolved context tuple. See [`upstream-asks.md`](./upstream-asks.md).

## [0.1.0] — 2026-08-05

> **First tagged Daybreak release.** The framework has been in use for some time
> (Framework v1 and v1.1 — 23 features — are shipped); this is the point it becomes
> **versioned and consumable**, so a leaf fork merges a named release rather than
> whatever `main` happens to be.
>
> The entry below describes the leaf-facing surface **as it stands today**. It is
> deliberately not a retroactive log of 23 features — that history lives in
> [`planning/plan.md`](./planning/plan.md)'s Work-completed log.

### ⚠️ Changed — action required for existing leaf forks

- **`lib/app/data-export.ts` is now Daybreak-owned; leaf collectors move to the new
  `lib/app/leaf-data-export.ts`.**

  **If your leaf fills `lib/app/data-export.ts`, move that code before merging** —
  otherwise the merge conflicts, and resolving it the obvious way (keeping yours)
  silently drops the framework's own tables from every subject-access export.

  Why it moved: Sunrise v0.8.0 added a GDPR Art. 15 subject-access export
  (`exportUserData()`) plus a coverage guard that fails until every `User`-linked
  model declares what a data subject receives from it. Sunrise's design assumes
  **two** tiers — core declares its tables, the leaf declares its own via
  `lib/app/data-export.ts` — and Daybreak is a **third** tier in between, with ten
  `framework_*` models of its own to declare. Because the seam is a static function
  rather than a registry, there was no way for the framework tier to contribute
  without occupying it.

  Daybreak therefore fills `data-export.ts` as a **bridge** (its third, after
  `bootstrap.ts` and `admin-nav.ts`) and delegates to a reserved
  **`lib/app/leaf-data-export.ts`** for the leaf — the same pattern as
  `leaf-bootstrap.ts` and `leaf-admin-nav.ts`. Your collector goes there, unchanged
  in shape; only the file name and export name differ
  (`collectLeafSubjectData`).

  Tracked upstream as Sunrise
  [#533](https://github.com/human-centric-engineering/sunrise/issues/533) — if
  Sunrise grows a contributor seam, `data-export.ts` returns to the leaf and this
  reverses. See [`upstream-asks.md`](./upstream-asks.md).

### Added

- **`DAYBREAK_VERSION`** (`lib/daybreak-version.ts`) — the framework version, and
  the middle of three tiers. `APP_VERSION` reads `package.json`, which in a leaf
  names the **leaf**, so it cannot answer which framework the app is running;
  `SUNRISE_VERSION` answers for the platform. Merged through to leaves, **never
  edited by them**.
- **`daybreak` on `GET /api/health`** — so an operator can read all three tiers
  (`version` / `daybreak` / `sunrise`) off a running deployment. Required in the
  response schema, matching `sunrise`.
- **`.context/framework/VERSIONING.md`** — what a Daybreak version commits to, the
  tight definition of the leaf-facing **public surface**, the `daybreak-vX.Y.Z` tag
  convention, and the release checklist.
- **`.context/framework/building-on-daybreak.md`** — the guide for building a leaf
  app on Daybreak: the reserved leaf surface, the sync recipe, and how migrations
  from three tiers interleave.
- **`npm run framework:changelog`** — a CI guard (wired into `app:ci-checks`) that
  fails a PR touching the mechanically-detectable public surface without a
  changelog entry, so this file cannot quietly go stale.

### Platform

- **Sunrise v0.8.0** is the platform version as of this release (synced in
  [#181](https://github.com/human-centric-engineering/daybreak/pull/181)). Its own
  changes — the subject-access export, `SIGNUP_MODE`, the email-change security
  fix, private storage objects, the authenticated-nav and post-auth landing seams —
  are documented in [`../../CHANGELOG.md`](../../CHANGELOG.md). Only the
  leaf-contract consequence is repeated above.

[unreleased]: https://github.com/human-centric-engineering/daybreak/compare/daybreak-v0.1.0...HEAD
[0.1.0]: https://github.com/human-centric-engineering/daybreak/releases/tag/daybreak-v0.1.0
