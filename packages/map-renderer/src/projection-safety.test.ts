import { describe, expect, it } from 'vitest';
import { assertPlayerProjectionSafe } from './projection-safety';

const forbiddenKeys = [
  'canonicalId',
  'canonical_id',
  'sourceLocationId',
  'source_location_id',
  'ownerUserId',
  'owner_user_id',
  'worldId',
  'world_id',
  'secretPayload',
  'secret_payload',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'email',
] as const;

describe('assertPlayerProjectionSafe', () => {
  it('accepts deeply nested player-safe projection data', () => {
    expect(() =>
      assertPlayerProjectionSafe({
        projectionVersion: 1,
        mapKey: 'player-map',
        generatedAt: '2026-08-30T20:50:00.000Z',
        items: [
          {
            id: 'node-safe',
            kind: 'node',
            metadata: { nested: { visible: true } },
          },
        ],
      }),
    ).not.toThrow();
  });

  it.each(forbiddenKeys)('rejects forbidden key %s at any nesting depth', (key) => {
    const tainted = {
      projectionVersion: 1,
      items: [{ metadata: { nested: { [key]: 'must-not-leak' } } }],
    };

    expect(() => assertPlayerProjectionSafe(tainted)).toThrow(`Forbidden player projection key: ${key}`);
  });
});
