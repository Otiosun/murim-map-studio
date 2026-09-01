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

const knowledgePresentation = {
  confidence: 'high' as const,
  source: { kind: 'npc' as const, label: 'Mestre Han' },
  freshness: 'recent' as const,
  privacy: 'private' as const,
};

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
        knowledgePresentation,
        detail,
      },
    ],
  };
}

function projectionWithKnowledgePresentation(presentation: unknown) {
  return {
    projectionVersion: 1,
    mapKey: 'player-map',
    generatedAt: NOW,
    items: [
      {
        id: 'node-safe',
        kind: 'node',
        metadata: {},
        position: { x: 1, y: 2 },
        role: 'known',
        symbolKey: 'location:settlement',
        knowledgeState: 'confirmed',
        knowledgePresentation: presentation,
      },
      {
        id: 'route-safe',
        kind: 'route',
        metadata: {},
        fromItemId: 'node-safe',
        toItemId: 'node-safe',
        path: {
          kind: 'polyline',
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        },
        styleKey: 'route:confirmed',
        knowledgeState: 'confirmed',
        knowledgePresentation: presentation,
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
          knowledgePresentation: {
            confidence: 'low',
            source: { kind: 'npc' },
            freshness: 'recent',
            privacy: 'private',
          },
          approximateLocation: { center: { x: 120, y: 80 }, radius: 40 },
          metadata: {},
        },
      ],
    };

    expect(mapProjectionSchema.parse(projection)).toEqual(projection);
  });

  it('accepts the same strict knowledge envelope on nodes and routes', () => {
    const projection = projectionWithKnowledgePresentation(knowledgePresentation);

    expect(parseMapProjection(projection)).toEqual(projection);
  });

  it('counts source labels by Unicode code points', () => {
    const label = '🀄'.repeat(120);
    const projection = projectionWithKnowledgePresentation({
      ...knowledgePresentation,
      source: { kind: 'document', label },
    });

    expect(parseMapProjection(projection).items[0]).toMatchObject({
      knowledgePresentation: { source: { label } },
    });
  });

  it.each([
    { ...knowledgePresentation, confidence: 'certain' },
    { ...knowledgePresentation, source: { kind: 'oracle' } },
    { ...knowledgePresentation, freshness: 'fresh' },
    { ...knowledgePresentation, privacy: 'friends-only' },
    { ...knowledgePresentation, source: { kind: 'npc', label: '   ' } },
    { ...knowledgePresentation, source: { kind: 'npc', label: '🀄'.repeat(121) } },
    { ...knowledgePresentation, source: { kind: 'npc', sourceRef: WORLD_ID } },
    { ...knowledgePresentation, source: { kind: 'npc', sourceId: WORLD_ID } },
    { ...knowledgePresentation, source: { kind: 'npc', canonicalId: WORLD_ID } },
    { ...knowledgePresentation, unexpected: true },
  ])('rejects invalid player knowledge presentation %#', (presentation) => {
    expect(() => parseMapProjection(projectionWithKnowledgePresentation(presentation))).toThrow();
  });

  it('rejects missing knowledge presentation on player node and route items', () => {
    const projection = projectionWithKnowledgePresentation(knowledgePresentation);
    const withoutPresentation = {
      ...projection,
      items: projection.items.map(({ knowledgePresentation: _knowledgePresentation, ...item }) => item),
    };

    expect(() => parseMapProjection(withoutPresentation)).toThrow();
  });

  it('rejects legacy numeric confidence in the player projection contract', () => {
    const projection = projectionWithKnowledgePresentation(knowledgePresentation);
    const legacy = {
      ...projection,
      items: projection.items.map((item) => ({ ...item, confidence: 0.95 })),
    };

    expect(() => parseMapProjection(legacy)).toThrow();
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
          knowledgePresentation,
          sourceEntityId: WORLD_ID,
        },
      ],
    };

    expect(() => mapProjectionSchema.parse(projection)).toThrow();
  });
});
