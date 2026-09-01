import { describe, expect, test } from 'vitest';
import { mapProjectionSchema } from '../../world-schema/src/schemas';
import {
  buildPlayerMapProjection,
  type PlayerProjectionNodeInput,
  type PlayerProjectionRouteInput,
} from './player-projection';

const generatedAt = '2026-08-30T05:10:00.000Z';

const forbiddenProjectionKeys = new Set([
  'canonicalId',
  'sourceLocationId',
  'source_location_id',
  'worldId',
  'world_id',
  'secretPayload',
  'secret_payload',
]);

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }

  if (value === null || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => [
    key,
    ...collectObjectKeys(nestedValue),
  ]);
}

const privateExplorationKnowledge = {
  confidence: 'very-high',
  source: { kind: 'exploration' },
  freshness: 'not-applicable',
  privacy: 'private',
} as const;

const rumorKnowledge = {
  confidence: 'low',
  source: { kind: 'npc', label: 'Mercador desconhecido' },
  freshness: 'aging',
  privacy: 'private',
} as const;

const routeKnowledge = {
  confidence: 'moderate',
  source: { kind: 'npc', label: 'Mercador desconhecido' },
  freshness: 'aging',
  privacy: 'private',
} as const;

const village: PlayerProjectionNodeInput = {
  projectionId: 'node-village',
  kind: 'village',
  label: 'Qinghe Village',
  knowledgeState: 'confirmed',
  knowledgePresentation: privateExplorationKnowledge,
  role: 'known',
  position: { x: 100, y: 200 },
};

const hiddenRuinRumor: PlayerProjectionNodeInput = {
  projectionId: 'node-hidden-rumor',
  kind: 'ruin',
  label: 'Unknown ruins',
  knowledgeState: 'rumor',
  knowledgePresentation: rumorKnowledge,
  role: 'ghost',
  position: { x: 820, y: 860 },
  approximateRadius: 180,
};

const visibleRoute: PlayerProjectionRouteInput = {
  projectionId: 'route-visible',
  fromProjectionId: 'node-village',
  toProjectionId: 'node-hidden-rumor',
  label: 'Old trail',
  knowledgeState: 'indication',
  knowledgePresentation: routeKnowledge,
  path: {
    kind: 'polyline',
    points: [
      { x: 100, y: 200 },
      { x: 820, y: 860 },
    ],
  },
};

describe('buildPlayerMapProjection', () => {
  test('builds known and ghost nodes using only player-safe projection data', () => {
    const projection = buildPlayerMapProjection({
      mapKey: 'player-a:outer-ring',
      generatedAt,
      nodes: [village, hiddenRuinRumor],
      routes: [],
    });

    expect(mapProjectionSchema.parse(projection)).toEqual(projection);
    expect(projection).toEqual({
      projectionVersion: 1,
      mapKey: 'player-a:outer-ring',
      generatedAt,
      items: [
        {
          id: 'node-village',
          kind: 'node',
          metadata: {},
          position: { x: 100, y: 200 },
          role: 'known',
          symbolKey: 'location:village',
          label: 'Qinghe Village',
          knowledgeState: 'confirmed',
          knowledgePresentation: privateExplorationKnowledge,
        },
        {
          id: 'node-hidden-rumor',
          kind: 'node',
          metadata: {},
          position: { x: 820, y: 860 },
          role: 'ghost',
          symbolKey: 'location:ruin',
          label: 'Unknown ruins',
          knowledgeState: 'rumor',
          knowledgePresentation: rumorKnowledge,
          approximateLocation: {
            center: { x: 820, y: 860 },
            radius: 180,
          },
        },
      ],
    });
    expect(JSON.stringify(projection)).not.toMatch(/"confidence":\s*0(?:\.|,|})/);
  });

  test('copies only the supplied typed node detail into the projection', () => {
    const projection = buildPlayerMapProjection({
      mapKey: 'player-map',
      generatedAt: '2026-08-31T18:00:00.000Z',
      nodes: [
        {
          projectionId: 'node:known',
          kind: 'settlement',
          label: 'Vila Qinghe',
          knowledgeState: 'confirmed',
          knowledgePresentation: privateExplorationKnowledge,
          role: 'known',
          position: { x: 100, y: 120 },
          detail: { category: 'Vila', summary: 'Um assentamento conhecido.' },
        },
      ],
      routes: [],
    });

    expect(projection.items[0]).toMatchObject({
      kind: 'node',
      detail: { category: 'Vila', summary: 'Um assentamento conhecido.' },
    });
  });

  test('does not synthesize detail when none is supplied', () => {
    const projection = buildPlayerMapProjection({
      mapKey: 'player-map',
      generatedAt: '2026-08-31T18:00:00.000Z',
      nodes: [
        {
          projectionId: 'node:known',
          kind: 'settlement',
          label: 'Vila Qinghe',
          knowledgeState: 'confirmed',
          knowledgePresentation: privateExplorationKnowledge,
          role: 'known',
          position: { x: 100, y: 120 },
        },
      ],
      routes: [],
    });

    expect(projection.items[0]).not.toHaveProperty('detail');
  });

  test('emits routes only when both projection-local endpoints exist', () => {
    const projection = buildPlayerMapProjection({
      mapKey: 'player-a:outer-ring',
      generatedAt,
      nodes: [village, hiddenRuinRumor],
      routes: [
        visibleRoute,
        {
          projectionId: 'route-missing-endpoint',
          fromProjectionId: 'node-village',
          toProjectionId: 'canonical-location-not-projected',
          knowledgeState: 'rumor',
          knowledgePresentation: {
            confidence: 'low',
            source: { kind: 'system' },
            freshness: 'not-applicable',
            privacy: 'private',
          },
          path: {
            kind: 'polyline',
            points: [
              { x: 100, y: 200 },
              { x: 999, y: 999 },
            ],
          },
        },
      ],
    });

    expect(mapProjectionSchema.parse(projection)).toEqual(projection);
    expect(projection.items.filter((item) => item.kind === 'route')).toEqual([
      {
        id: 'route-visible',
        kind: 'route',
        metadata: {},
        fromItemId: 'node-village',
        toItemId: 'node-hidden-rumor',
        path: {
          kind: 'polyline',
          points: [
            { x: 100, y: 200 },
            { x: 820, y: 860 },
          ],
        },
        styleKey: 'route:indication',
        label: 'Old trail',
        knowledgeState: 'indication',
        knowledgePresentation: routeKnowledge,
      },
    ]);
  });

  test('requires every ghost node to carry a positive uncertainty radius', () => {
    const ghostWithoutRadius = { ...hiddenRuinRumor };
    delete ghostWithoutRadius.approximateRadius;

    expect(() =>
      buildPlayerMapProjection({
        mapKey: 'player-a:outer-ring',
        generatedAt,
        nodes: [village, ghostWithoutRadius],
        routes: [],
      }),
    ).toThrowError('Ghost projection nodes require a positive approximateRadius');

    expect(() =>
      buildPlayerMapProjection({
        mapKey: 'player-a:outer-ring',
        generatedAt,
        nodes: [village, { ...hiddenRuinRumor, approximateRadius: 0 }],
        routes: [],
      }),
    ).toThrowError('Ghost projection nodes require a positive approximateRadius');
  });

  test('does not copy canonical or private field names into the normalized projection', () => {
    const taintedVillage = {
      ...village,
      canonicalId: 'canonical-village',
      worldId: 'world-private-id',
      secret_payload: { hidden: true },
    } as PlayerProjectionNodeInput;
    const taintedRoute = {
      ...visibleRoute,
      sourceLocationId: 'canonical-route-source',
      source_location_id: 'canonical-route-source',
      secretPayload: { hidden: true },
    } as PlayerProjectionRouteInput;

    const projection = buildPlayerMapProjection({
      mapKey: 'player-a:outer-ring',
      generatedAt,
      nodes: [taintedVillage, hiddenRuinRumor],
      routes: [taintedRoute],
    });

    expect(mapProjectionSchema.parse(projection)).toEqual(projection);
    expect(collectObjectKeys(projection).filter((key) => forbiddenProjectionKeys.has(key))).toEqual(
      [],
    );
  });

  test('keeps the authorized secret label out of Player A while revealing it to Player B', () => {
    const playerASecret: PlayerProjectionNodeInput = {
      projectionId: 'node-secret-a',
      kind: 'monastery',
      label: 'Unknown structure',
      knowledgeState: 'rumor',
      knowledgePresentation: {
        confidence: 'low',
        source: { kind: 'npc' },
        freshness: 'aging',
        privacy: 'private',
      },
      role: 'ghost',
      position: { x: 820, y: 860 },
      approximateRadius: 180,
    };
    const playerBSecret: PlayerProjectionNodeInput = {
      projectionId: 'node-secret-b',
      kind: 'monastery',
      label: 'Hidden Monastery',
      knowledgeState: 'investigated',
      knowledgePresentation: {
        confidence: 'very-high',
        source: { kind: 'exploration' },
        freshness: 'not-applicable',
        privacy: 'private',
      },
      role: 'known',
      position: { x: 900, y: 900 },
    };

    const playerAProjection = buildPlayerMapProjection({
      mapKey: 'player-a:outer-ring',
      generatedAt,
      nodes: [village, playerASecret],
      routes: [],
    });
    const playerBProjection = buildPlayerMapProjection({
      mapKey: 'player-b:outer-ring',
      generatedAt,
      nodes: [village, playerBSecret],
      routes: [],
    });

    expect(playerAProjection).not.toEqual(playerBProjection);
    expect(JSON.stringify(playerAProjection)).not.toContain('Hidden Monastery');
    expect(JSON.stringify(playerBProjection)).toContain('Hidden Monastery');
  });
});
