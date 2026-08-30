import {
  createCommandHistory,
  executeWithHistory,
  redoWithHistory,
  undoWithHistory,
  type CommandHistory,
  type CommandMetadata,
  type CommandPayload,
  type LocationEntity,
  type WorldDocument,
} from '@murim/domain';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ASSET_ENTITIES,
  LEGACY_STUDIO_WORLD_ID,
  STUDIO_WORLD_ID,
} from './studio-assets';
import {
  createInitialWorldDocument,
  decodeStudioDocument,
  encodeStudioDocument,
  inspectorFieldsFor,
} from './studio-model';

const WORLD_NOW = '2026-08-30T00:00:00.000Z';
let sequence = 0;

function meta(): CommandMetadata {
  sequence += 1;
  return {
    commandId: `smoke-command-${sequence}`,
    issuedAt: `2026-08-30T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    source: 'test',
    actor: { kind: 'user', ref: 'smoke-adm' },
    correlationId: `smoke-correlation-${sequence}`,
  };
}

function run(
  document: WorldDocument,
  history: CommandHistory,
  payload: CommandPayload,
): { document: WorldDocument; history: CommandHistory } {
  const result = executeWithHistory(document, history, { meta: meta(), payload });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return { document: result.document, history: result.history };
}

function location(id: string, name: string, x: number, y: number): LocationEntity {
  return {
    id,
    type: 'location',
    schemaVersion: 1,
    createdAt: WORLD_NOW,
    updatedAt: WORLD_NOW,
    worldId: STUDIO_WORLD_ID,
    name,
    locationKind: 'place',
    position: { x, y },
    tags: [],
  };
}

describe('Studio V0 model', () => {
  it('drives the mandatory command smoke through undo, redo, save and reload without drift', () => {
    sequence = 0;
    let document = createInitialWorldDocument(WORLD_NOW);
    let history = createCommandHistory();

    ({ document, history } = run(document, history, {
      kind: 'CreateEntity',
      entity: location('location-a', 'Local 1', 100, 120),
    }));
    ({ document, history } = run(document, history, {
      kind: 'MoveEntity',
      entityId: 'location-a',
      position: { x: 220, y: 260 },
    }));
    ({ document, history } = run(document, history, {
      kind: 'UpdateProperty',
      entityId: 'location-a',
      property: 'name',
      mutation: { operation: 'set', value: 'Vila Qinghe' },
    }));
    ({ document, history } = run(document, history, {
      kind: 'CreateEntity',
      entity: location('location-b', 'Passagem Norte', 520, 280),
    }));
    ({ document, history } = run(document, history, {
      kind: 'ConnectRoute',
      routeId: 'route-a-b',
      fromLocationId: 'location-a',
      toLocationId: 'location-b',
      routeKind: 'path',
      bidirectional: true,
      tags: [],
    }));

    const canonicalBeforeUndo = structuredClone(document);

    const undone = undoWithHistory(document, history, meta());
    expect(undone.ok).toBe(true);
    if (!undone.ok) throw new Error(undone.error.message);
    expect(undone.document.entities.some((entity) => entity.id === 'route-a-b')).toBe(false);

    const redone = redoWithHistory(undone.document, undone.history, meta());
    expect(redone.ok).toBe(true);
    if (!redone.ok) throw new Error(redone.error.message);
    document = redone.document;
    history = redone.history;

    expect(document).toEqual(canonicalBeforeUndo);
    expect(history.past).toHaveLength(5);

    const encoded = encodeStudioDocument(document, '2026-08-30T00:01:00.000Z');
    const decoded = decodeStudioDocument(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.reason);

    expect(decoded.envelope.document).toEqual(document);
    expect(decoded.envelope.document.entities.map((entity) => entity.id)).toEqual(
      document.entities.map((entity) => entity.id),
    );

    const qinghe = decoded.envelope.document.entities.find((entity) => entity.id === 'location-a');
    expect(qinghe?.type).toBe('location');
    if (!qinghe || qinghe.type !== 'location') throw new Error('Qinghe was not restored.');
    expect(qinghe.name).toBe('Vila Qinghe');
    expect(qinghe.position).toEqual({ x: 220, y: 260 });

    const route = decoded.envelope.document.entities.find((entity) => entity.id === 'route-a-b');
    expect(route?.type).toBe('route');
    if (!route || route.type !== 'route') throw new Error('Route was not restored.');
    expect(route.fromLocationId).toBe('location-a');
    expect(route.toLocationId).toBe('location-b');
    expect(route.path.points).toEqual([
      { x: 220, y: 260 },
      { x: 520, y: 280 },
    ]);
  });

  it('rejects malformed or domain-invalid persisted payloads', () => {
    expect(decodeStudioDocument('not-json').ok).toBe(false);

    const invalid = createInitialWorldDocument(WORLD_NOW);
    invalid.rootWorldId = 'missing-world';
    const raw = JSON.stringify({
      schemaVersion: 1,
      savedAt: WORLD_NOW,
      document: invalid,
    });
    expect(decodeStudioDocument(raw).ok).toBe(false);
  });

  it('uses a contextual inspector registry instead of component-local property lists', () => {
    const entity = location('location-a', 'Qinghe', 1, 2);
    expect(inspectorFieldsFor(entity).map((field) => field.property)).toEqual([
      'name',
      'locationKind',
    ]);
  });

  it('migrates the legacy Studio world id and preserves scoped entities', () => {
    const legacy: WorldDocument = {
      schemaVersion: 1,
      rootWorldId: LEGACY_STUDIO_WORLD_ID,
      entities: [
        {
          id: LEGACY_STUDIO_WORLD_ID,
          type: 'world',
          schemaVersion: 1,
          createdAt: WORLD_NOW,
          updatedAt: WORLD_NOW,
          name: 'Legado',
          coordinateSystem: {
            kind: 'planar',
            unit: 'world-unit',
            origin: { x: 0, y: 0 },
          },
        },
        {
          ...location('legacy-location', 'Legado', 10, 20),
          worldId: LEGACY_STUDIO_WORLD_ID,
        },
      ],
    };

    const decoded = decodeStudioDocument(
      JSON.stringify({ schemaVersion: 1, savedAt: WORLD_NOW, document: legacy }),
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.reason);

    expect(decoded.envelope.document.rootWorldId).toBe(STUDIO_WORLD_ID);
    const migrated = decoded.envelope.document.entities.find(
      (entity) => entity.id === 'legacy-location',
    );
    expect(migrated && 'worldId' in migrated ? migrated.worldId : null).toBe(STUDIO_WORLD_ID);
    expect(
      decoded.envelope.document.entities.filter((entity) => entity.type === 'asset').length,
    ).toBe(BUILT_IN_ASSET_ENTITIES.length);
  });

  it('swaps a Location asset through a Command without changing semantic identity', () => {
    sequence = 0;
    let document = createInitialWorldDocument(WORLD_NOW);
    let history = createCommandHistory();
    const original = location('location-asset-test', 'Vila Qinghe', 320, 180);

    ({ document, history } = run(document, history, {
      kind: 'CreateEntity',
      entity: original,
    }));

    const assetId = BUILT_IN_ASSET_ENTITIES[0]?.id;
    if (!assetId) throw new Error('Built-in asset library is empty.');

    ({ document, history } = run(document, history, {
      kind: 'UpdateProperty',
      entityId: original.id,
      property: 'assetId',
      mutation: { operation: 'set', value: assetId },
    }));

    const changed = document.entities.find((entity) => entity.id === original.id);
    expect(changed?.type).toBe('location');
    if (!changed || changed.type !== 'location') throw new Error('Location disappeared.');

    expect(changed.id).toBe(original.id);
    expect(changed.name).toBe(original.name);
    expect(changed.position).toEqual(original.position);
    expect(changed.assetId).toBe(assetId);
    expect(history.past).toHaveLength(2);
  });
});
