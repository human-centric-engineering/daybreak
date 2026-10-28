/**
 * The framework tier's erasure hook and stale writer (Sunrise 0.16.0 §122).
 *
 * `eraseFromBindingTemplates` runs inside the erasure transaction: it is handed the transaction
 * client, so the tests hand it a small stateful fake of the two tables it touches and assert the
 * rows it leaves. The blanking itself is core's real `blankAddressInTemplate`.
 *
 * @see lib/framework/privacy/erasure.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ErasureTxContext } from '@/lib/privacy/erasure-hooks';
import {
  BINDING_PAGE_SIZE,
  BINDING_TEMPLATES_HOOK,
  DISPATCH_FILE,
  eraseFromBindingTemplates,
  initFrameworkErasureHooks,
} from '@/lib/framework/privacy/erasure';
import {
  __resetErasureCleanupHooksForTests,
  getAppStaleWriters,
  getErasureCleanupHooks,
} from '@/lib/privacy/erasure-hooks';

interface BindingRow {
  id: string;
  moduleId: string;
  eventType: string;
  workflowId: string;
  orgId: string | null;
  inputTemplate: unknown;
}

function fakeTx(rows: BindingRow[]) {
  const audits: Array<Record<string, unknown>> = [];
  const pages: number[] = [];
  const tx = {
    moduleWorkflowBinding: {
      findMany: async (args: { where?: { id: { gt: string } }; take: number }) => {
        const after = args.where?.id.gt;
        const page = [...rows]
          .sort((a, b) => a.id.localeCompare(b.id))
          .filter((r) => after === undefined || r.id > after)
          .slice(0, args.take)
          .map((r) => ({ ...r }));
        pages.push(page.length);
        return page;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { inputTemplate: unknown };
      }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`no binding ${where.id}`);
        row.inputTemplate = data.inputTemplate;
        return row;
      },
    },
    aiAdminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
  return { tx, audits, pages };
}

function binding(id: string, inputTemplate: unknown): BindingRow {
  return {
    id,
    moduleId: 'm-1',
    eventType: 'module.completed',
    workflowId: 'wf-1',
    orgId: 'org-1',
    inputTemplate,
  };
}

function ctx(tx: unknown, overrides: Partial<ErasureTxContext> = {}): ErasureTxContext {
  return {
    tx: tx as ErasureTxContext['tx'],
    userId: 'user-1',
    email: ' Erased@Example.com ',
    emailVerified: true,
    ...overrides,
  };
}

describe('eraseFromBindingTemplates', () => {
  it('blanks the verified address wherever a template holds it, and audits each change', async () => {
    const rows = [
      binding('b1', { to: 'erased@example.com', cc: 'kept@example.com' }),
      binding('b2', { recipients: ['ERASED@example.com', 'kept@example.com'] }),
      binding('b3', { to: 'kept@example.com' }),
      binding('b4', null),
    ];
    const { tx, audits } = fakeTx(rows);

    const changed = await eraseFromBindingTemplates(ctx(tx));

    expect(changed).toBe(2);
    expect(rows[0].inputTemplate).toEqual({ to: '', cc: 'kept@example.com' });
    expect(rows[1].inputTemplate).toEqual({ recipients: ['kept@example.com'] });
    expect(rows[2].inputTemplate).toEqual({ to: 'kept@example.com' });
    expect(rows[3].inputTemplate).toBeNull();
    expect(audits.map((a) => a.entityId)).toEqual(['b1', 'b2']);
    expect(audits[0]).toMatchObject({
      action: 'module_workflow_binding.recipient_erased',
      entityType: 'module_workflow_binding',
      changes: { inputTemplateValuesCleared: { from: 1, to: 0 } },
      metadata: expect.objectContaining({ orgId: 'org-1', workflowId: 'wf-1' }),
    });
    // The audit row never carries the address it erased.
    expect(JSON.stringify(audits)).not.toMatch(/erased@example\.com/i);
  });

  it('matches nothing for an unverified account — its address may be a stranger’s', async () => {
    const rows = [binding('b1', { to: 'erased@example.com' })];
    const { tx, audits } = fakeTx(rows);

    const changed = await eraseFromBindingTemplates(ctx(tx, { emailVerified: false }));

    expect(changed).toBe(0);
    expect(rows[0].inputTemplate).toEqual({ to: 'erased@example.com' });
    expect(audits).toEqual([]);
  });

  it('reads every page, so a binding past the first is not missed', async () => {
    const rows = Array.from({ length: BINDING_PAGE_SIZE + 1 }, (_, i) =>
      binding(`b${String(i).padStart(4, '0')}`, { note: 'nobody' })
    );
    rows[BINDING_PAGE_SIZE].inputTemplate = { to: 'erased@example.com' };
    const { tx, pages } = fakeTx(rows);

    const changed = await eraseFromBindingTemplates(ctx(tx));

    expect(pages).toEqual([BINDING_PAGE_SIZE, 1]);
    expect(changed).toBe(1);
    expect(rows[BINDING_PAGE_SIZE].inputTemplate).toEqual({ to: '' });
  });
});

describe('initFrameworkErasureHooks', () => {
  beforeEach(() => __resetErasureCleanupHooksForTests());

  it('registers the binding-template hook and declares the dispatcher as a taken-at writer', () => {
    initFrameworkErasureHooks();
    initFrameworkErasureHooks(); // idempotent: keyed registries replace, never duplicate

    const hooks = getErasureCleanupHooks().filter((h) => h.name === BINDING_TEMPLATES_HOOK);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].scrubInTransaction).toBeTypeOf('function');
    expect(getAppStaleWriters()).toEqual([
      expect.objectContaining({
        file: DISPATCH_FILE,
        model: 'AiWorkflowExecution',
        anchor: 'taken-at',
      }),
    ]);
  });
});
