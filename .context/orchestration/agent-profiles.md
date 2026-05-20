# Agent profiles — resolver and composition

Profiles let one or more `AiAgent` rows inherit a shared **persona**, **brand voice**, and
**guardrails** via the optional `AiAgent.profileId` FK. This doc covers the rules — the admin
surface lives under [`.context/admin/orchestration-agent-profiles.md`](../admin/orchestration-agent-profiles.md).

## Data model

```prisma
model AiAgentProfile {
  id          String  @id @default(cuid())
  name        String
  slug        String  @unique
  description String? @db.Text
  persona                String? @db.Text
  brandVoiceInstructions String? @db.Text
  guardrails             String? @db.Text
  // …creator, timestamps, agents[]
}

model AiAgent {
  // existing fields…
  persona     String? @db.Text   // agent-level override / append text
  guardrails  String? @db.Text
  // brandVoiceInstructions already existed; now also inheritable

  personaMode    String @default("override")  // "override" | "append"
  voiceMode      String @default("override")
  guardrailsMode String @default("override")

  profileId  String?
  profile    AiAgentProfile? @relation(fields: [profileId], references: [id], onDelete: SetNull)
}
```

`onDelete: SetNull` means deleting a profile cleanly detaches every attached agent — their own
override texts remain; they just stop inheriting.

## Per-field resolution

Three inheritable fields, three modes — applied independently per field. The agent's own text is
trimmed before evaluation; whitespace-only counts as "not set" so clearing a textarea returns to
inherit.

```
const agentText   = trim(agent.X)
const profileText = trim(profile?.X)
const mode        = agent.XMode ?? 'override'

agentText && profileText && mode === 'append'  →  `${profileText}\n\n${agentText}`   source: 'profile+agent'
agentText                                       →  agentText                          source: 'agent'
profileText                                     →  profileText                        source: 'profile'
otherwise                                       →  null                               source: 'none'
```

`systemInstructions` is **never** inheritable — it stays on the agent and is always sourced as
`'agent'`. The task description is what makes the agent worth having separately; sharing it
through a profile would defeat the point of multiple agents.

### Mode summary

| Agent text | Mode                         | Effective value                       |
| ---------- | ---------------------------- | ------------------------------------- |
| null/""    | (ignored)                    | profile value (or null if no profile) |
| populated  | `override`                   | agent value                           |
| populated  | `append` + profile has value | `${profile}\n\n${agent}`              |
| populated  | `append` + profile blank     | agent value (source: agent)           |

Mode columns default to `override` so any agent saved before this feature shipped (or any agent
that never opts into a profile) behaves exactly as today.

## Composition order

Once resolved, the four sections are joined into a single `system` message with this exact
order — owned by `composeSections` in `lib/orchestration/agents/resolve-effective-prompt.ts`:

```
[Persona]
<persona text>

<systemInstructions>

[Guardrails]
<guardrails text>

[Brand Voice]
<brand voice text>
```

- **Persona first** — establishes identity before the task starts.
- **Instructions** — what to do.
- **Guardrails** — boundary rules apply to the work.
- **Brand voice last** — model recency bias keeps tone fresh in the working window.

Sections with null text are omitted cleanly (no empty `[…]` headers).

## Resolver API

`lib/orchestration/agents/resolve-effective-prompt.ts` is **pure and isomorphic** — no Prisma, no
logger, no server-only imports. The admin form imports it directly to power the live "Effective
prompt" preview without a network round-trip.

```ts
export function resolveEffectivePrompt(
  agent: AgentPromptFields,
  profile: ProfilePromptFields | null
): ResolvedAgentPrompt;

export function composeSystemPromptString(resolved: ResolvedAgentPrompt): string;

export function composeSections(opts: {
  persona?: string | null;
  systemInstructions: string;
  guardrails?: string | null;
  brandVoiceInstructions?: string | null;
}): string;
```

`ResolvedAgentPrompt.sources` carries a per-field tag — `'agent' | 'profile' | 'profile+agent' |
'none'` — plus `profileId` and `profileName`. The admin form uses this for the per-section
badges; debug traces can use it to explain "why did the agent say that?".

## Integration points

Both runtimes call the resolver, so a single agent produces byte-identical system prompts
regardless of how it's invoked:

| Site                                                                | What it does                                                                                                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/orchestration/chat/streaming-handler.ts`                       | Loads agent with `include: { profile: true }`, resolves, passes args to `buildMessages`.                                                            |
| `lib/orchestration/engine/executors/agent-call.ts`                  | Same load + resolve, then `composeSystemPromptString` for the inline system message.                                                                |
| `lib/orchestration/chat/message-builder.ts`                         | Accepts persona / guardrails / brandVoiceInstructions as separate args; calls `composeSections` so the joining logic is owned by the resolver file. |
| `components/admin/orchestration/agent-form.tsx` (Effective preview) | Same `resolveEffectivePrompt` in the browser, fed by the form's draft state.                                                                        |

## Why no profile-level history

Profile updates don't carry the `systemInstructionsHistory` JSON column that lives on the agent —
profiles are administrative settings, not chat-affecting content. Changes are tracked via:

- `updatedAt` timestamp on the row
- `logAdminAction` audit entry (`agent_profile.update`) with the diff

For per-agent rollback the existing agent-version snapshots include the new fields
(`persona`, `guardrails`, `personaMode`, `voiceMode`, `guardrailsMode`) so a rollback restores
the agent's own values. `profileId` is intentionally **excluded** from the version snapshot —
the PATCH route uses Prisma's relation form (`profile: { connect | disconnect }`) so the scalar
key isn't in the update payload, and a profile-pointer change shows up implicitly through the
resolved field values.

## Where to read next

- [Agent profile admin pages](../admin/orchestration-agent-profiles.md) — UI walkthrough.
- [Agent form](../admin/agent-form.md) — General-tab selector + Instructions-tab preview.
- [Chat module](./chat.md) — message-builder and the broader system-message shape.
