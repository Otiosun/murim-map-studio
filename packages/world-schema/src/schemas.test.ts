import { describe, expect, it } from 'vitest';
import {
  deserializeWorldPack,
  mapProjectionSchema,
  parseMapProjection,
  parseWorldPack,
  serializeWorldPack,
} from './index';

const NOW = '2026-08-29T22:00:00Z';
const WORLD_ID = '00000000-0000-4000-8000-000000000001';
const LOCATION_A_ID = '00000000-0000-4000-8000-000000000002';
const LOCATION_B_ID = '00000000-0000-4000-8000-000000000003';
const ROUTE_ID = '00000000-0000-4000-8000-000000000004';

function validPack() {
  return {
    format: 'murim-world-pack' as const,
    schemaVersion: 1 as const,
    exportedAt: NOW,
    rootWorldId: WORLD_ID,
    entities: [
      {
        id: WORLD_ID,
        type: 'world' as const,
        schemaVersion: 1 as const,
        createdAt: NOW,
        updatedAt: NOW,
        name: 'Murim',
        coordinateSystem: {
          kind: 'planar' as const,
          unit: 'world-unit' as const,
          origin: { x: 0, y: 0 },
        },
      },
      {
        id: LOCATION_A_ID,
        type: 'location' as const,
        schemaVersion: 1 as const,
        createdAt: NOW,
        updatedAt: NOW,
        worldId: WORLD_ID,
        name: 'Vila Qinghe',
        locationKind: 'village',
        position: { x: 9000, y: 0 },
        tags: [],
      },
      {
        id: LOCATION_B_ID,
        type: 'location' as const,
        schemaVersion: 1 as const,
        createdAt: NOW,
        updatedAt: NOW,
        worldId: WORLD_ID,
        name: 'Passagem Norte',
        locationKind: 'pass',
        position: { x: 8500, y: 500 },
        tags: [],
      },
      {
        id: ROUTE_ID,
        type: 'route' as const,
        schemaVersion: 1 as const,
        createdAt: NOW,
        updatedAt: NOW,
        worldId: WORLD_ID,
        fromLocationId: LOCATION_A_ID,
        toLocationId: LOCATION_B_ID,
        routeKind: 'road',
        path: {
          kind: 'polyline' as const,
          points: [
            { x: 9000, y: 0 },
            { x: 8500, y: 500 },
          ],
        },
        bidirectional: true,
        tags: [],
      },
    ],
  };
}

function projectionWithDetail(detail: unknown) {
  return {
    projectionVersion: 1,
    mapKey: 'player-map',
    generatedAt: '2026-08-31T18:00:00.000Z',
    items: [
      {
        id: 'node-safe',
        kind: 'node',
        metadata: {},
        position: { x: 1, y: 2 },
        role: 'known',
        symbolKey: 'location:settlement',
        detail,
      },
    ],
  };
}

describe('worldPackSchema', () => {
  it('validates and round-trips a renderer-independent mini world', () => {
    const parsed = parseWorldPack(validPack());
    const roundTrip = deserializeWorldPack(serializeWorldPack(parsed));

    expect(roundTrip).toEqual(parsed);
  });

  it('rejects semantic references that point to the wrong type', () => {
    const pack = validPack();
    pack.entities[3] = {
      ...pack.entities[3],
      toLocationId: WORLD_ID,
    } as (typeof pack.entities)[number];

    expect(() => parseWorldPack(pack)).toThrow(/invalid_reference_type/);
  });

  it('rejects non-finite coordinates at the boundary', () => {
    const pack = validPack();
    pack.entities[1] = {
      ...pack.entities[1],
      position: { x: Number.POSITIVE_INFINITY, y: 0 },
    } as (typeof pack.entities)[number];

    expect(() => parseWorldPack(pack)).toThrow();
  });
});

describe('mapProjectionSchema', () => {
  it('accepts a projection-local ghost node without canonical world identity', () => {
    const projection = {
      projectionVersion: 1,
      mapKey: 'player-map:demo',
      generatedAt: NOW,
      items: [
        {
          id: 'ghost-1',
          kind: 'node',
          position: { x: 120, y: 80 },
          role: 'ghost',
          symbolKey: 'unknown-cave',
          knowledgeState: 'rumor',
          confidence: 0.35,
          approximateLocation: { center: { x: 120, y: 80 }, radius: 40 },
          metadata: {},
        },
      ],
    };

    expect(mapProjectionSchema.parse(projection)).toEqual(projection);
  });

  it('trims and accepts only the typed player-safe node detail fields', () => {
    const parsed = parseMapProjection(
      projectionWithDetail({
        category: '  Vila  ',
        summary: '  Conhecida pelo jogador.  ',
      }),
    );

    expect(parsed.items[0]).toMatchObject({
      detail: { category: 'Vila', summary: 'Conhecida pelo jogador.' },
    });
  });

  it.each([
    { category: 'Vila', canonicalId: 'x' },
    { category: { nested: true } },
    { category: '   ' },
    { category: 'x'.repeat(81) },
    { summary: 'x'.repeat(601) },
  ])('rejects unsafe or invalid node detail %#', (detail) => {
    expect(() => parseMapProjection(projectionWithDetail(detail))).toThrow();
  });

  it('rejects accidental canonical ids leaking into a strict player projection', () => {
    const projection = {
      projectionVersion: 1,
      mapKey: 'player-map:demo',
      generatedAt: NOW,
      items: [
        {
          id: 'node-1',
          kind: 'node',
          position: { x: 1, y: 2 },
          role: 'known',
          symbolKey: 'village',
          metadata: {},
          sourceEntityId: WORLD_ID,
        },
      ],
    };

    expect(() => mapProjectionSchema.parse(projection)).toThrow();
  });
});
