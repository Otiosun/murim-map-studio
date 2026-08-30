import { describe, expect, test } from 'vitest';
import type { KnowledgeState, PolylineGeometry, WorldPoint } from '@murim/domain';
import { mapProjectionSchema } from '../../world-schema/src/schemas';
import * as mapRenderer from './index';
import type { MapProjection } from './projection';

interface PlayerProjectionNodeInput {
  projectionId: string;
  kind: string;
  label: string;
  knowledgeState: KnowledgeState;
  confidence: number;
  role: 'known' | 'ghost';
  position: WorldPoint;
  approximateRadius?: number;
}

interface PlayerProjectionRouteInput {
  projectionId: string;
  fromProjectionId: string;
  toProjectionId: string;
  label?: string;
  knowledgeState: KnowledgeState;
  path: PolylineGeometry;
}

type PlayerProjectionBuilder = (input: {
  mapKey: string;
  generatedAt: string;
  nodes: readonly PlayerProjectionNodeInput[];
  routes: readonly PlayerProjectionRouteInput[];
}) => MapProjection;

function getBuilder(): PlayerProjectionBuilder {
  const candidate = (mapRenderer as { buildPlayerMapProjection?: unknown })
    .buildPlayerMapProjection;

  expect(candidate).toBeTypeOf('function');
  return candidate as PlayerProjectionBuilder;
}

const generatedAt = '2026-08-30T05:10:00.000Z';

const village: PlayerProjectionNodeInput = {
  projectionId: 'node-village',
  kind: 'village',
  label: 'Qinghe Village',
  knowledgeState: 'confirmed',
  confidence: 0.95,
  role: 'known',
  position: { x: 100, y: 200 },
};

const hiddenRuinRumor: PlayerProjectionNodeInput = {
  projectionId: 'node-hidden-rumor',
  kind: 'ruin',
  label: 'Unknown ruins',
  knowledgeState: 'rumor',
  confidence: 0.35,
  role: 'ghost',
  position: { x: 820, y: 860 },
  approximateRadius: 180,
};

describe('buildPlayerMapProjection', () => {
  test('builds known and ghost nodes using only player-safe projection data', () => {
    const projection = getBuilder()({
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
          confidence: 0.95,
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
          confidence: 0.35,
          approximateLocation: {
            center: { x: 820, y: 860 },
            radius: 180,
          },
        },
      ],
    });
  });

  test('emits routes only when both projection-local endpoints exist', () => {
    const projection = getBuilder()({
      mapKey: 'player-a:outer-ring',
      generatedAt,
      nodes: [village, hiddenRuinRumor],
      routes: [
        {
          projectionId: 'route-visible',
          fromProjectionId: 'node-village',
          toProjectionId: 'node-hidden-rumor',
          label: 'Old trail',
          knowledgeState: 'indication',
          path: {
            kind: 'polyline',
            points: [
              { x: 100, y: 200 },
              { x: 820, y: 860 },
            ],
          },
        },
        {
          projectionId: 'route-missing-endpoint',
          fromProjectionId: 'node-village',
          toProjectionId: 'canonical-location-not-projected',
          knowledgeState: 'rumor',
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
      },
    ]);
  });
});
