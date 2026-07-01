# Daybreak — fork playbook

Daybreak is an AI-application framework built **on** the
[Sunrise](https://github.com/human-centric-engineering/sunrise) platform. This
document is the fork-author / AI-agent playbook: what Daybreak owns, what
Sunrise owns, and how to keep pulling upstream releases clean. It complements
[`CUSTOMIZATION.md`](./CUSTOMIZATION.md) (the canonical, in-depth guide shipped
by Sunrise) — read that for the detail; read this for the Daybreak-specific
framing and the quick rules.

## The relationship

- **Sunrise is the platform.** Forked at **v0.4.1**. Treat it as an upgradable
  dependency that happens to live in the same repo: auth, `lib/` utilities, the
  API/security/rate-limit middleware, the orchestration engine, the migration
  tooling. **Extend it; don't edit it.**
- **Daybreak is the app/framework.** Your routes, components, models,
  capabilities, and framework logic — added in **new files alongside** the
  platform, or through Sunrise's designed seams.

Git-wise, Sunrise is the `upstream` remote and shares full history with this
repo, so upstream releases merge as ordinary 3-way merges (not "unrelated
histories").

## What you own vs what Sunrise owns

**Fork-owned — edit freely:**

- New files anywhere — pages (`app/(public|protected)/…`), API routes
  (`app/api/v1/<resource>/`), `components/`, `lib/` modules
- `prisma/schema/app.prisma` + your own migrations (name them `app_…`)
- The `lib/app/*` scaffold — `env.ts`, `rate-limit.ts`, `capabilities.ts`,
  `admin-nav.ts`, `public-nav.ts`, `agent-fields.ts`, `surface.ts`, `emails.ts`,
  `db-drift.ts`. Sunrise ships these **empty for the fork**; your registrations
  here merge cleanly with no special handling.
- `app/brand-theme.css`, and branding via env (`NEXT_PUBLIC_APP_NAME`,
  `NEXT_PUBLIC_LEGAL_NAME`) — **not** by editing `lib/brand.ts`
- `package.json`, `README.md`, `CUSTOMIZATION.md`, this file, `.env*`

**Platform-owned — don't edit; extend through a seam instead:**

- Core `lib/` utilities, core `app/api/v1` routes, core `components/`, the
  security / rate-limit middleware (`proxy.ts`, `lib/security/**`)
- `lib/sunrise-version.ts`, `VERSIONING.md`, `CHANGELOG.md`, `.context/**`
  (Sunrise's docs), and the SQL of any **Sunrise** migration
- `CLAUDE.md` below its Daybreak banner — keep Daybreak instructions in the
  banner or here, so upstream `CLAUDE.md` edits merge cleanly

If you genuinely must change platform behaviour and no seam exists: keep the
edit as small as possible and add a follow-up rather than rewriting the file.
A one-line "keep mine" is a cheap merge; a rewritten platform file fights every
future release.

## Two-version model

| Constant                                                      | Means                                           | Who edits it                                          |
| ------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `package.json.version` → `APP_VERSION` (`lib/app-version.ts`) | **Daybreak's** app version                      | Daybreak, on each Daybreak release                    |
| `SUNRISE_VERSION` (`lib/sunrise-version.ts`)                  | The **Sunrise platform** version we forked from | Sunrise upstream — we merge it through, never edit it |

Both surface on `/api/health` (`version` = Daybreak, `sunrise` = platform). See
[`CUSTOMIZATION.md` §8](./CUSTOMIZATION.md).

## Tracking Daybreak's own changes

`CHANGELOG.md` is **Sunrise's** public-surface log — leave it untouched so
upstream changelog edits merge cleanly. Daybreak's own release notes, when we
start cutting Daybreak releases, live in a **separate** file (e.g.
`CHANGELOG.daybreak.md`) — do not fold Daybreak entries into Sunrise's
`CHANGELOG.md`.

## Pulling an upstream Sunrise release

```bash
git fetch upstream --tags
git merge vX.Y.Z            # e.g. git merge v0.5.0
# resolve conflicts keeping Daybreak's version, add follow-ups not rewrites
npm run db:migrate:status  # see newly-merged Sunrise migrations
npm run db:migrate:dev      # (dev) apply them  ·  db:migrate:deploy for prod/CI
npm run validate && npm run test
```

The migration directory is the main moving part — Sunrise and Daybreak
migrations share `prisma/migrations/` and interleave by timestamp. Never edit an
applied Sunrise migration; add a follow-up. Full reconciliation recipe:
[`CUSTOMIZATION.md` §9](./CUSTOMIZATION.md) and
[`.context/database/migrations.md`](./.context/database/migrations.md).

## Reference

- [`CLAUDE.md`](./CLAUDE.md) — Daybreak fork banner + Sunrise's platform instructions
- [`CUSTOMIZATION.md`](./CUSTOMIZATION.md) — the canonical build-on-Sunrise guide
- [`.context/`](./.context/) — Sunrise's platform documentation substrate
