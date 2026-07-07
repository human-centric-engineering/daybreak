/**
 * Proposal validation pipeline (f-emergence t-2). Mocks the map publish gate + the graph query;
 * proves validateProposal reuses `validatePublishableMap`, resolves the base version, rejects an
 * unsupported subject, and propagates the validator/not-found errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/map/version-service', () => ({
  validatePublishableMap: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/map/queries', () => ({ getGraphDetail: vi.fn() }));

import { validateProposal } from '@/lib/framework/facilitation/emergence/pipeline';
import { validatePublishableMap } from '@/lib/framework/facilitation/map/version-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const DEFINITION = { nodes: [], edges: [], regions: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validatePublishableMap).mockReturnValue(DEFINITION);
  vi.mocked(getGraphDetail).mockResolvedValue({ publishedVersion: { version: 3 } } as never);
});

describe('validateProposal', () => {
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

  it('rejects an unsupported subject type (ValidationError, no reads)', async () => {
    await expect(validateProposal('policy' as never, 'g', {})).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(validatePublishableMap).not.toHaveBeenCalled();
  });

  it('propagates a ValidationError from the map publish gate', async () => {
    vi.mocked(validatePublishableMap).mockImplementation(() => {
      throw new ValidationError('bad map');
    });
    await expect(validateProposal('map', 'g', {})).rejects.toBeInstanceOf(ValidationError);
    expect(getGraphDetail).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError for an unknown map', async () => {
    vi.mocked(getGraphDetail).mockRejectedValue(
      new NotFoundError('Facilitation map "nope" not found')
    );
    await expect(validateProposal('map', 'nope', {})).rejects.toBeInstanceOf(NotFoundError);
  });
});
