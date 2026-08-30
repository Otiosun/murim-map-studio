import { describe, expect, it } from 'vitest';
import { createSupabasePlayerProjectionSource } from './player-projection-source';

const playerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const knownId = '11111111-1111-4111-8111-111111111111';
const ghostId = '22222222-2222-4222-8222-222222222222';
const routeId = '33333333-3333-4333-8333-333333333333';
const generatedAt = '2026-08-30T20:50:00.000Z';

type TableName = 'map_nodes' | 'map_routes';

function nodeRow(overrides: Record<string, unknown> = {}) {
  return {
    owner_user_id: playerId,
    projection_id: knownId,
    kind: 'village',
    label: 'Qinghe Village',
    knowledge_state: 'confirmed',
    confidence: 0.95,
    role: 'known',
    approximate_radius: null,
    geom: { type: 'Point', coordinates: [100, 200] },
    details: { secret_payload: 'must never be copied' },
    updated_at: generatedAt,
    ...overrides,
  };
}

function routeRow(overrides: Record<string, unknown> = {}) {
  return {
    owner_user_id: playerId,
    projection_id: routeId,
    from_projection_id: knownId,
    to_projection_id: ghostId,
    label: 'Old trail',
    knowledge_state: 'indication',
    geom: {
      type: 'LineString',
      coordinates: [
        [100, 200],
        [820, 860],
      ],
    },
    details: { canonicalId: 'must never be copied' },
    updated_at: generatedAt,
    ...overrides,
  };
}

function createPlayerApiClient(rows: Record<TableName, unknown[]>) {
  const calls: Array<{ schema: string; table: string; column: string; value: string }> = [];
  const client = {
    schema(schema: string) {
      return {
        from(table: TableName) {
          return {
            select(_columns: string) {
              return {
                async eq(column: string, value: string) {
                  calls.push({ schema, table, column, value });
                  return { data: rows[table], error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function createSource(rows: Record<TableName, unknown[]>, now: () => string = () => generatedAt) {
  const fake = createPlayerApiClient(rows);
  return {
    ...fake,
    source: createSupabasePlayerProjectionSource(fake.client, now),
  };
}

describe('createSupabasePlayerProjectionSource', () => {
  it('loads only player-scoped rows and builds a strict safe projection', async () => {
    const ghost = nodeRow({
      projection_id: ghostId,
      kind: 'ruin',
      label: 'Unknown ruins',
      knowledge_state: 'rumor',
      confidence: 0.35,
      role: 'ghost',
      approximate_radius: 180,
      geom: { type: 'Point', coordinates: [820, 860] },
    });
    const { source, calls } = createSource({
      map_nodes: [nodeRow(), ghost],
      map_routes: [routeRow()],
    });

    const projection = await source.load(playerId);

    expect(calls).toEqual([
      { schema: 'player_api', table: 'map_nodes', column: 'owner_user_id', value: playerId },
      { schema: 'player_api', table: 'map_routes', column: 'owner_user_id', value: playerId },
    ]);
    expect(projection.projectionVersion).toBe(1);
    expect(projection.mapKey).toBe('player-map');
    expect(projection.generatedAt).toBe(generatedAt);
    expect(projection.items[0]).toMatchObject({ kind: 'node', position: { x: 100, y: 200 } });
    expect(projection.items[2]).toMatchObject({
      kind: 'route',
      path: {
        kind: 'polyline',
        points: [
          { x: 100, y: 200 },
          { x: 820, y: 860 },
        ],
      },
    });
    expect(JSON.stringify(projection)).not.toContain('secret_payload');
    expect(JSON.stringify(projection)).not.toContain('canonicalId');
    expect(projection.items).toHaveLength(3);
  });

  it('rejects the built projection when it fails the strict schema', async () => {
    const { source } = createSource(
      {
        map_nodes: [nodeRow()],
        map_routes: [],
      },
      () => 'not-an-iso-timestamp',
    );

    await expect(source.load(playerId)).rejects.toThrow();
  });

  it('rejects a known node carrying uncertainty', async () => {
    const { source } = createSource({
      map_nodes: [nodeRow({ approximate_radius: 10 })],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map node');
  });

  it('requires a positive uncertainty radius for ghost nodes', async () => {
    const { source } = createSource({
      map_nodes: [nodeRow({ role: 'ghost', approximate_radius: null })],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map node');
  });

  it('rejects non-finite Point geometry', async () => {
    const { source } = createSource({
      map_nodes: [
        nodeRow({ geom: { type: 'Point', coordinates: [100, Number.POSITIVE_INFINITY] } }),
      ],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map node');
  });

  it('rejects LineString geometry with fewer than two finite points', async () => {
    const { source } = createSource({
      map_nodes: [nodeRow(), nodeRow({ projection_id: ghostId })],
      map_routes: [routeRow({ geom: { type: 'LineString', coordinates: [[100, 200]] } })],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map route');
  });

  it('rejects unknown geometry instead of guessing its structure', async () => {
    const { source } = createSource({
      map_nodes: [nodeRow({ geom: { type: 'Polygon', coordinates: [] } })],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map node');
  });

  it('fails closed when a returned row belongs to another owner', async () => {
    const { source } = createSource({
      map_nodes: [nodeRow({ owner_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' })],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map node');
  });
});
