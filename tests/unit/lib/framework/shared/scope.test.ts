import { describe, expect, it } from 'vitest';

import {
  SCOPE_KEYS,
  decodeScope,
  encodeScope,
  type FrameworkScope,
} from '@/lib/framework/shared/scope';

describe('framework scope vocabulary', () => {
  describe('encodeScope', () => {
    it('encodes populated members under the well-known keys', () => {
      expect(encodeScope({ moduleSlug: 'core-values', nodeKey: 'intro' })).toEqual({
        [SCOPE_KEYS.moduleSlug]: 'core-values',
        [SCOPE_KEYS.nodeKey]: 'intro',
      });
    });

    it('omits undefined members (empty scope → {})', () => {
      expect(encodeScope({})).toEqual({});
      expect(encodeScope({ moduleSlug: 'core-values' })).toEqual({
        [SCOPE_KEYS.moduleSlug]: 'core-values',
      });
    });

    it('preserves an empty-string value rather than dropping it', () => {
      // '' is a real value, distinct from "absent" — encode must keep it.
      expect(encodeScope({ nodeKey: '' })).toEqual({ [SCOPE_KEYS.nodeKey]: '' });
    });
  });

  describe('decodeScope', () => {
    it('reads the well-known keys out of a generic scope map', () => {
      expect(
        decodeScope({ [SCOPE_KEYS.moduleSlug]: 'core-values', [SCOPE_KEYS.nodeKey]: 'intro' })
      ).toEqual({ moduleSlug: 'core-values', nodeKey: 'intro' });
    });

    it('ignores unknown keys and tolerates undefined input', () => {
      expect(decodeScope({ somethingElse: 'x' })).toEqual({});
      expect(decodeScope(undefined)).toEqual({});
    });
  });

  it('round-trips encode → decode', () => {
    const scope: FrameworkScope = { moduleSlug: 'core-values', nodeKey: 'intro' };
    expect(decodeScope(encodeScope(scope))).toEqual(scope);
  });
});
