import { describe, expect, it } from 'vitest';
import { createSupabasePlayerProjectionSource } from './player-projection-source';

const playerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const knownId = '11111111-1111-4111-8111-111111111111';
const ghostId = '22222222-2222-4222-8222-222222222222';
const routeId = '33333333-3333-4333-8333-333333333333';
const generatedAt = '2026-08-30T20:50:00.000Z';

type TableName = 'map_nodes' | 'map_routes';

function safeKnowledgeRow(overrides: Record<string, unknown> = {}) {
  return {
    confidence_band: 'very-high',
    source_kind: 'exploration',
    source_label: 'Chegada própria',
    freshness: 'not-applicable',
    privacy: 'private',
    ...overrides,
  };
}

function nodeRow(overrides: Record<string, unknown> = {}) {
  return {
    owner_user_id: playerId,
    projection_id: knownId,
    kind: 'village',
    label: 'Qinghe Village',
    knowledge_state: 'confirmed',
    ...safeKnowledgeRow(),
    role: 'known',
    approximate_radius: null,
    geom: { type: 'Point', coordinates: [100, 200] },
    details: {},
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
    ...safeKnowledgeRow({
      confidence_band: 'moderate',
      source_kind: 'npc',
      source_label: null,
      freshness: 'recent',
      privacy: 'shared',
    }),
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
  const calls: Array<{
    schema: string;
    table: string;
    columns: string;
    column: string;
    value: string;
  }> = [];
  const client = {
    schema(schema: string) {
      return {
        from(table: TableName) {
          return {
            select(columns: string) {
              return {
                async eq(column: string, value: string) {
                  calls.push({ schema, table, columns, column, value });
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
  it('loads only player-safe semantic metadata and builds a strict projection', async () => {
    const ghost = nodeRow({
      projection_id: ghostId,
      kind: 'ruin',
      label: 'Unknown ruins',
      knowledge_state: 'rumor',
      confidence_band: 'low',
      source_kind: 'npc',
      source_label: null,
      freshness: 'recent',
      role: 'ghost',
      approximate_radius: 180,
      geom: { type: 'Point', coordinates: [820, 860] },
    });
    const { source, calls } = createSource({
      map_nodes: [nodeRow(), ghost],
      map_routes: [routeRow()],
    });

    const projection = await source.load(playerId);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      schema: 'player_api',
      table: 'map_nodes',
      column: 'owner_user_id',
      value: playerId,
    });
    expect(calls[0]?.columns).toContain('confidence_band');
    expect(calls[0]?.columns).toContain('source_kind');
    expect(calls[0]?.columns).toContain('source_label');
    expect(calls[0]?.columns).toContain('freshness');
    expect(calls[0]?.columns).toContain('privacy');
    expect(calls[0]?.columns).toContain('details');
    expect(calls[0]?.columns).not.toMatch(/(^|,)confidence(,|$)/);
    expect(calls[0]?.columns).not.toContain('world_minute');
    expect(calls[0]?.columns).not.toContain('source_location_id');
    expect(calls[1]).toMatchObject({
      schema: 'player_api',
      table: 'map_routes',
      column: 'owner_user_id',
      value: playerId,
    });
    expect(calls[1]?.columns).toContain('confidence_band');
    expect(calls[1]?.columns).not.toMatch(/(^|,)confidence(,|$)/);
    expect(calls[1]?.columns).not.toContain('world_minute');
    expect(calls[1]?.columns).not.toContain('source_route_id');

    expect(projection.projectionVersion).toBe(1);
    expect(projection.mapKey).toBe('player-map');
    expect(projection.generatedAt).toBe(generatedAt);
    expect(projection.items[0]).toMatchObject({
      kind: 'node',
      position: { x: 100, y: 200 },
      knowledgePresentation: {
        confidence: 'very-high',
        source: { kind: 'exploration', label: 'Chegada própria' },
        freshness: 'not-applicable',
        privacy: 'private',
      },
    });
    expect(projection.items[0]).not.toHaveProperty('detail');
    expect(projection.items[1]).toMatchObject({
      kind: 'node',
      knowledgePresentation: {
        confidence: 'low',
        source: { kind: 'npc' },
        freshness: 'recent',
        privacy: 'private',
      },
    });
    expect(projection.items[2]).toMatchObject({
      kind: 'route',
      knowledgePresentation: {
        confidence: 'moderate',
        source: { kind: 'npc' },
        freshness: 'recent',
        privacy: 'shared',
      },
      path: {
        kind: 'polyline',
        points: [
          { x: 100, y: 200 },
          { x: 820, y: 860 },
        ],
      },
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('canonicalId');
    expect(serialized).not.toContain('source_location_id');
    expect(serialized).not.toContain('source_route_id');
    expect(serialized).not.toContain('refreshed_world_minute');
    expect(serialized).not.toContain('learned_world_minute');
    expect(projection.items).toHaveLength(3);
  });

  it.each([
    [{ category: '  Vila  ' }, { category: 'Vila' }],
    [{ summary: '  Conhecida pelo jogador.  ' }, { summary: 'Conhecida pelo jogador.' }],
    [
      { category: '  Vila  ', summary: '  Conhecida pelo jogador.  ' },
      { category: 'Vila', summary: 'Conhecida pelo jogador.' },
    ],
  ])('accepts and trims authorized detail %#', async (details, expectedDetail) => {
    const { source } = createSource({
      map_nodes: [nodeRow({ details })],
      map_routes: [],
    });

    const projection = await source.load(playerId);

    expect(projection.items[0]).toMatchObject({
      kind: 'node',
      detail: expectedDetail,
    });
  });

  it.each([
    null,
    [],
    'text',
    { category: '' },
    { category: ' '.repeat(4) },
    { category: 'x'.repeat(81) },
    { summary: 'x'.repeat(601) },
    { category: 123 },
    { summary: { nested: true } },
    { category: 'Vila', source_location_id: 'forbidden' },
  ])('fails closed for invalid player node detail %#', async (details) => {
    const { source } = createSource({
      map_nodes: [nodeRow({ details })],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow('Invalid player map node detail');
  });

  it('accepts and trims a known source label by Unicode code points', async () => {
    const label = `  ${'🀄'.repeat(120)}  `;
    const { source } = createSource({
      map_nodes: [nodeRow({ source_kind: 'document', source_label: label })],
      map_routes: [],
    });

    const projection = await source.load(playerId);

    expect(projection.items[0]).toMatchObject({
      knowledgePresentation: {
        source: { kind: 'document', label: '🀄'.repeat(120) },
      },
    });
  });

  it('omits source label when the player does not know the specific source', async () => {
    const { source } = createSource({
      map_nodes: [nodeRow({ source_kind: 'npc', source_label: null })],
      map_routes: [],
    });

    const projection = await source.load(playerId);

    expect(projection.items[0]).toMatchObject({
      knowledgePresentation: { source: { kind: 'npc' } },
    });
    expect(
      (projection.items[0] as { knowledgePresentation: { source: Record<string, unknown> } })
        .knowledgePresentation.source,
    ).not.toHaveProperty('label');
  });

  it.each([
    ['confidence_band', 'certain'],
    ['source_kind', 'oracle'],
    ['freshness', 'fresh'],
    ['privacy', 'friends-only'],
    ['source_label', '   '],
    ['source_label', '🀄'.repeat(121)],
    ['source_label', 123],
  ])('fails closed for invalid player knowledge metadata %s=%#', async (key, value) => {
    const { source } = createSource({
      map_nodes: [nodeRow({ [key]: value })],
      map_routes: [],
    });

    await expect(source.load(playerId)).rejects.toThrow();
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
