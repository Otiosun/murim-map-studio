import { describe, expect, it } from 'vitest';
import { assertPlayerProjectionSafe } from './projection-safety';

const forbiddenRouteKeys = [
  'canonicalRouteId',
  'canonical_route_id',
  'sourceRouteId',
  'source_route_id',
  'fromLocationId',
  'from_location_id',
  'toLocationId',
  'to_location_id',
] as const;

describe('player route projection safety', () => {
  it.each(forbiddenRouteKeys)('rejects route-private key %s at any nesting depth', (key) => {
    const tainted = {
      projectionVersion: 1,
      items: [{ metadata: { nested: { [key]: 'private-route-value' } } }],
    };

    expect(() => assertPlayerProjectionSafe(tainted)).toThrow(
      `Forbidden player projection key: ${key}`,
    );
  });
});
