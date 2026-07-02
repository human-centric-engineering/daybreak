/**
 * DELIBERATE BOUNDARY VIOLATION — not real code, never imported.
 *
 * This file sits on a *core* path (`scripts/**`, outside `lib/framework/**` and
 * `lib/app/**`) and statically imports `@/lib/framework`. That is exactly the
 * core → framework import the ESLint framework-tier boundary forbids
 * (`eslint.config.mjs`, base `no-restricted-imports` → `@/lib/framework` group).
 *
 * `scripts/boundary/check.ts` lints this file with `--no-ignore` and asserts the
 * rule flags it. If ESLint ever STOPS flagging it, the boundary has silently
 * decayed and the check fails — a green main therefore proves the boundary bites.
 *
 * It is excluded from `npm run lint` via a global ignore in `eslint.config.mjs`,
 * so it never breaks a normal lint run. Do not "fix" the import — the violation
 * is the point.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- import presence is the test
import { encodeScope } from '@/lib/framework/shared/scope';

// Reference the symbol so the sole reported problem is the boundary violation,
// not an unused import (belt-and-suspenders alongside the disable above).
export const _deliberateViolation = encodeScope;
