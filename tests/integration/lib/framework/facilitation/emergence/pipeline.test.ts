/**
 * Proposal validation pipeline (f-emergence t-2; subjects widened in f-governance-plus t-1). Mocks
 * each subject's reused validator + base-version reader; proves validateProposal dispatches on the
 * subject (map → publish gate, module_config → config schema, policy → policy validator), resolves
 * the right conflict base, rejects an unknown subject, and propagates each validator's errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/map/version-service', () => ({
  validatePublishableMap: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/map/queries', () => ({ getGraphDetail: vi.fn() }));
vi.mock('@/lib/framework/modules/config/version-service', () => ({
  validateModuleConfig: vi.fn(),
  getLatestModuleVersionNumber: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/policies/kinds', () => ({
  assertValidFacilitationPolicy: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/policies/policy-queries', () => ({
  getFacilitationPolicy: vi.fn(),
}));

import { validateProposal } from '@/lib/framework/facilitation/emergence/pipeline';
import { validatePublishableMap } from '@/lib/framework/facilitation/map/version-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import {
  validateModuleConfig,
  getLatestModuleVersionNumber,
} from '@/lib/framework/modules/config/version-service';
import { assertValidFacilitationPolicy } from '@/lib/framework/facilitation/policies/kinds';
import { getFacilitationPolicy } from '@/lib/framework/facilitation/policies/policy-queries';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const DEFINITION = { nodes: [], edges: [], regions: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validatePublishableMap).mockReturnValue(DEFINITION);
  vi.mocked(getGraphDetail).mockResolvedValue({ publishedVersion: { version: 3 } } as never);
  vi.mocked(validateModuleConfig).mockReturnValue({ greeting: 'hi' });
  vi.mocked(getLatestModuleVersionNumber).mockResolvedValue(2);
  vi.mocked(assertValidFacilitationPolicy).mockReturnValue({
    kind: 'auto_approval',
    payload: { mode: 'none' },
  } as never);
  vi.mocked(getFacilitationPolicy).mockResolvedValue({
    id: 'pol-1',
    kind: 'auto_approval',
  } as never);
});

describe('validateProposal — map', () => {
  it('validates the definition and resolves the base published version', async () => {
    const result = await validateProposal('map', 'onboarding-map', { nodes: [] });
    expect(validatePublishableMap).toHaveBeenCalledWith({ nodes: [] });
    expect(getGraphDetail).toHaveBeenCalledWith('onboarding-map');
    expect(result).toEqual({ definition: DEFINITION, baseVersion: 3, riskClass: 'unclassified' });
  });

  it('resolves baseVersion null when the map has no published version', async () => {
    vi.mocked(getGraphDetail).mockResolvedValue({ publishedVersion: null } as never);
    expect((await validateProposal('map', 'g', {})).baseVersion).toBeNull();
  });

  it('propagates a ValidationError from the map publish gate (no reads)', async () => {
    vi.mocked(validatePublishableMap).mockImplementation(() => {
      throw new ValidationError('bad map');
    });
    await expect(validateProposal('map', 'g', {})).rejects.toBeInstanceOf(ValidationError);
    expect(getGraphDetail).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError for an unknown map', async () => {
    vi.mocked(getGraphDetail).mockRejectedValue(new NotFoundError('map "nope" not found'));
    await expect(validateProposal('map', 'nope', {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('validateProposal — module_config', () => {
  it('validates against the module schema and captures the live version as base', async () => {
    const result = await validateProposal('module_config', 'welcome', { greeting: 'hi' });
    expect(validateModuleConfig).toHaveBeenCalledWith('welcome', { greeting: 'hi' });
    expect(getLatestModuleVersionNumber).toHaveBeenCalledWith('welcome');
    expect(result).toEqual({
      definition: { greeting: 'hi' },
      baseVersion: 2,
      riskClass: 'unclassified',
    });
  });

  it('resolves baseVersion null when the module has never been configured', async () => {
    vi.mocked(getLatestModuleVersionNumber).mockResolvedValue(null);
    expect((await validateProposal('module_config', 'welcome', {})).baseVersion).toBeNull();
  });

  it('propagates a ValidationError from the config schema (after resolving the base)', async () => {
    vi.mocked(validateModuleConfig).mockImplementation(() => {
      throw new ValidationError('bad config');
    });
    await expect(validateProposal('module_config', 'welcome', {})).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('propagates NotFoundError for an unknown module BEFORE validating the config (uniform target-not-found)', async () => {
    vi.mocked(getLatestModuleVersionNumber).mockRejectedValue(
      new NotFoundError('Module "nope" not found')
    );
    await expect(validateProposal('module_config', 'nope', {})).rejects.toBeInstanceOf(
      NotFoundError
    );
    // Existence is checked first, so the schema validator never runs for an unknown target.
    expect(validateModuleConfig).not.toHaveBeenCalled();
  });
});

describe('validateProposal — policy', () => {
  it('resolves the target policy by id, validates the payload against its kind (base null)', async () => {
    const result = await validateProposal('policy', 'pol-1', { mode: 'none' });
    expect(getFacilitationPolicy).toHaveBeenCalledWith('pol-1');
    // The kind comes from the resolved policy, not from the caller.
    expect(assertValidFacilitationPolicy).toHaveBeenCalledWith('auto_approval', { mode: 'none' });
    expect(result).toEqual({
      definition: { mode: 'none' },
      baseVersion: null,
      riskClass: 'unclassified',
    });
  });

  it('propagates NotFoundError for an unknown policy id (no validation)', async () => {
    vi.mocked(getFacilitationPolicy).mockRejectedValue(
      new NotFoundError('policy "nope" not found')
    );
    await expect(validateProposal('policy', 'nope', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(assertValidFacilitationPolicy).not.toHaveBeenCalled();
  });

  it('propagates a ValidationError from the policy validator', async () => {
    vi.mocked(assertValidFacilitationPolicy).mockImplementation(() => {
      throw new ValidationError('bad policy');
    });
    await expect(validateProposal('policy', 'pol-1', {})).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('validateProposal — unknown subject', () => {
  it('rejects an unknown subject type (ValidationError, no reads)', async () => {
    await expect(validateProposal('workflow' as never, 'g', {})).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(validatePublishableMap).not.toHaveBeenCalled();
    expect(validateModuleConfig).not.toHaveBeenCalled();
    expect(assertValidFacilitationPolicy).not.toHaveBeenCalled();
  });
});
