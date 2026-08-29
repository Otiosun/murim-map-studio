import { describe, expect, it } from 'vitest';
import type {
  LocationEntity,
  RingEntity,
  RouteEntity,
  WorldDocument,
  WorldEntityRoot,
} from './index';
import { validateWorldDocument } from './index';

const NOW = '2026-08-29T22:00:00Z';
const WORLD_ID = '00000000-0000-4000-8000-000000000001';
const RING_ID = '00000000-0000-4000-8000-000000000002';
const LOCATION_A_ID = '00000000-0000-4000-8000-000000000003';
const LOCATION_B_ID = '00000000-0000-4000-8000-000000000004';
const ROUTE_ID = '00000000-0000-4000-8000-000000000005';

const world: WorldEntityRoot = {
  id: WORLD_ID,
  type: 'world',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  name: 'Murim',
  coordinateSystem: { kind: 'planar', unit: 'world-unit', origin: { x: 0, y: 0 } },
};

const ring: RingEntity = {
  id: RING_ID,
  type: 'ring',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  worldId: WORLD_ID,
  name: 'Círculo Exterior',
  depth: 0,
  center: { x: 0, y: 0 },
  innerRadius: 8000,
  outerRadius: 10000,
  tags: [],
};

const locationA: LocationEntity = {
  id: LOCATION_A_ID,
  type: 'location',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  worldId: WORLD_ID,
  name: 'Vila Qinghe',
  locationKind: 'village',
  position: { x: 9000, y: 0 },
  tags: [],
};

const locationB: LocationEntity = {
  ...locationA,
  id: LOCATION_B_ID,
  name: 'Passagem Norte',
  position: { x: 8500, y: 400 },
};

const route: RouteEntity = {
  id: ROUTE_ID,
  type: 'route',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  worldId: WORLD_ID,
  fromLocationId: LOCATION_A_ID,
  toLocationId: LOCATION_B_ID,
  routeKind: 'road',
  path: { kind: 'polyline', points: [locationA.position, locationB.position] },
  bidirectional: true,
  tags: [],
};

function validDocument(): WorldDocument {
  return {
    schemaVersion: 1,
    rootWorldId: WORLD_ID,
    entities: [world, ring, locationA, locationB, route],
  };
}

describe('validateWorldDocument', () => {
  it('accepts a small valid renderer-independent world', () => {
    expect(validateWorldDocument(validDocument())).toEqual([]);
  });

  it('rejects duplicate entity ids', () => {
    const document = validDocument();
    document.entities.push({ ...locationA });

    expect(validateWorldDocument(document).some((issue) => issue.code === 'duplicate_id')).toBe(
      true,
    );
  });

  it('rejects references whose target has the wrong semantic type', () => {
    const document = validDocument();
    document.entities = document.entities.map((entity) =>
      entity.type === 'route' ? { ...entity, toLocationId: RING_ID } : entity,
    );

    expect(
      validateWorldDocument(document).some((issue) => issue.code === 'invalid_reference_type'),
    ).toBe(true);
  });

  it('rejects non-finite geometry', () => {
    const document = validDocument();
    document.entities = document.entities.map((entity) =>
      entity.type === 'location'
        ? { ...entity, position: { ...entity.position, x: Number.POSITIVE_INFINITY } }
        : entity,
    );

    expect(validateWorldDocument(document).some((issue) => issue.code === 'invalid_geometry')).toBe(
      true,
    );
  });

  it('rejects invalid radial ring bounds', () => {
    const document = validDocument();
    document.entities = document.entities.map((entity) =>
      entity.type === 'ring' ? { ...entity, innerRadius: 10000, outerRadius: 9000 } : entity,
    );

    expect(validateWorldDocument(document).some((issue) => issue.code === 'invalid_ring')).toBe(
      true,
    );
  });
});
