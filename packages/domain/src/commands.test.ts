import { describe, expect, it } from 'vitest';
import type {
  CommandMetadata,
  LocationEntity,
  RouteEntity,
  WorldCommand,
  WorldDocument,
  WorldEntityRoot,
} from './index';
import {
  applyWorldCommand,
  createCommandHistory,
  executeWithHistory,
  redoWithHistory,
  undoWithHistory,
  WORLD_EVENT_KINDS,
} from './index';

const WORLD_ID = '00000000-0000-4000-8000-000000000001';
const LOCATION_A_ID = '00000000-0000-4000-8000-000000000002';
const LOCATION_B_ID = '00000000-0000-4000-8000-000000000003';
const LOCATION_C_ID = '00000000-0000-4000-8000-000000000004';
const ROUTE_ID = '00000000-0000-4000-8000-000000000005';
const NEW_ROUTE_ID = '00000000-0000-4000-8000-000000000006';
const NOW = '2026-08-29T22:00:00Z';

const world: WorldEntityRoot = {
  id: WORLD_ID,
  type: 'world',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  name: 'Murim',
  coordinateSystem: { kind: 'planar', unit: 'world-unit', origin: { x: 0, y: 0 } },
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
  position: { x: 100, y: 120 },
  tags: [],
};

const locationB: LocationEntity = {
  ...locationA,
  id: LOCATION_B_ID,
  name: 'Passagem Norte',
  position: { x: 500, y: 520 },
};

const locationC: LocationEntity = {
  ...locationA,
  id: LOCATION_C_ID,
  name: 'Poço Antigo',
  position: { x: 300, y: 300 },
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
  path: { kind: 'polyline', points: [locationA.position, { x: 300, y: 320 }, locationB.position] },
  bidirectional: true,
  tags: [],
};

function document(): WorldDocument {
  return {
    schemaVersion: 1,
    rootWorldId: WORLD_ID,
    entities: [
      structuredClone(world),
      structuredClone(locationA),
      structuredClone(locationB),
      structuredClone(locationC),
      structuredClone(route),
    ],
  };
}

function meta(id: string, at = '2026-08-29T23:00:00Z'): CommandMetadata {
  return {
    commandId: id,
    issuedAt: at,
    source: 'test',
    actor: { kind: 'user', ref: 'tester' },
    correlationId: `corr-${id}`,
  };
}

function command(metaId: string, payload: WorldCommand['payload']): WorldCommand {
  return { meta: meta(metaId), payload };
}

function entity<T extends LocationEntity | RouteEntity>(value: WorldDocument, id: string): T {
  const found = value.entities.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Missing test entity ${id}`);
  }
  return found as T;
}

describe('Command Engine V0', () => {
  it('creates an entity and produces an inverse delete command', () => {
    const created: LocationEntity = {
      ...locationC,
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Novo Posto',
    };
    const result = applyWorldCommand(
      document(),
      command('cmd-create', { kind: 'CreateEntity', entity: created }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.entities.some((item) => item.id === created.id)).toBe(true);
    expect(result.inverse).toEqual({ kind: 'DeleteEntity', entityId: created.id });
    expect(result.auditEvent.eventKind).toBe('entity_created');
  });

  it('moves one location and connected route endpoints as one history action', () => {
    const original = document();
    const history = createCommandHistory();
    const moved = executeWithHistory(
      original,
      history,
      command('cmd-move', {
        kind: 'MoveEntity',
        entityId: LOCATION_A_ID,
        position: { x: 180, y: 210 },
      }),
    );

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.history.past).toHaveLength(1);
    expect(entity<LocationEntity>(moved.document, LOCATION_A_ID).position).toEqual({
      x: 180,
      y: 210,
    });
    expect(entity<RouteEntity>(moved.document, ROUTE_ID).path.points[0]).toEqual({
      x: 180,
      y: 210,
    });

    const undone = undoWithHistory(
      moved.document,
      moved.history,
      meta('cmd-undo-move', '2026-08-29T23:01:00Z'),
    );
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(entity<LocationEntity>(undone.document, LOCATION_A_ID).position).toEqual(
      locationA.position,
    );
    expect(entity<RouteEntity>(undone.document, ROUTE_ID).path.points[0]).toEqual(
      locationA.position,
    );
    expect(undone.auditEvent.payload.historyOperation).toBe('undo');

    const redone = redoWithHistory(
      undone.document,
      undone.history,
      meta('cmd-redo-move', '2026-08-29T23:02:00Z'),
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(entity<LocationEntity>(redone.document, LOCATION_A_ID).position).toEqual({
      x: 180,
      y: 210,
    });
    expect(redone.auditEvent.payload.historyOperation).toBe('redo');
  });

  it('updates only allow-listed properties and can undo the edit', () => {
    const executed = executeWithHistory(
      document(),
      createCommandHistory(),
      command('cmd-update', {
        kind: 'UpdateProperty',
        entityId: LOCATION_A_ID,
        property: 'name',
        mutation: { operation: 'set', value: 'Qinghe Renovada' },
      }),
    );

    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(entity<LocationEntity>(executed.document, LOCATION_A_ID).name).toBe('Qinghe Renovada');

    const undone = undoWithHistory(
      executed.document,
      executed.history,
      meta('cmd-undo-update', '2026-08-29T23:03:00Z'),
    );
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(entity<LocationEntity>(undone.document, LOCATION_A_ID).name).toBe('Vila Qinghe');
  });

  it('rejects identity patches instead of accepting arbitrary JSON property edits', () => {
    const result = applyWorldCommand(
      document(),
      command('cmd-bad-property', {
        kind: 'UpdateProperty',
        entityId: LOCATION_A_ID,
        property: 'id',
        mutation: { operation: 'set', value: 'hijacked' },
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_property' } });
  });

  it('validates references after property updates and rejects invalid commits atomically', () => {
    const original = document();
    const result = applyWorldCommand(
      original,
      command('cmd-missing-ref', {
        kind: 'UpdateProperty',
        entityId: LOCATION_A_ID,
        property: 'assetId',
        mutation: { operation: 'set', value: '00000000-0000-4000-8000-999999999999' },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invariant_violation');
    expect(entity<LocationEntity>(original, LOCATION_A_ID).assetId).toBeUndefined();
  });

  it('connects locations with a straight renderer-independent route when no path is supplied', () => {
    const result = applyWorldCommand(
      document(),
      command('cmd-connect', {
        kind: 'ConnectRoute',
        routeId: NEW_ROUTE_ID,
        fromLocationId: LOCATION_B_ID,
        toLocationId: LOCATION_C_ID,
        routeKind: 'trail',
        bidirectional: true,
        tags: ['new'],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const connected = entity<RouteEntity>(result.document, NEW_ROUTE_ID);
    expect(connected.path.points).toEqual([locationB.position, locationC.position]);
    expect(result.inverse).toEqual({ kind: 'DeleteEntity', entityId: NEW_ROUTE_ID });
    expect(result.auditEvent.eventKind).toBe('route_connected');
  });

  it('rejects deleting a referenced entity but deletes/restores an unreferenced entity', () => {
    const referencedDelete = applyWorldCommand(
      document(),
      command('cmd-delete-referenced', { kind: 'DeleteEntity', entityId: LOCATION_A_ID }),
    );
    expect(referencedDelete.ok).toBe(false);
    if (!referencedDelete.ok) {
      expect(referencedDelete.error.code).toBe('invariant_violation');
    }

    const deleted = executeWithHistory(
      document(),
      createCommandHistory(),
      command('cmd-delete-free', { kind: 'DeleteEntity', entityId: LOCATION_C_ID }),
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.document.entities.some((item) => item.id === LOCATION_C_ID)).toBe(false);

    const restored = undoWithHistory(
      deleted.document,
      deleted.history,
      meta('cmd-restore-free', '2026-08-29T23:04:00Z'),
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(entity<LocationEntity>(restored.document, LOCATION_C_ID).name).toBe(locationC.name);
    expect(restored.auditEvent.eventKind).toBe('entity_restored');
  });

  it('keeps audit metadata explicit and includes the minimum domain event vocabulary', () => {
    const result = applyWorldCommand(
      document(),
      command('cmd-audit', {
        kind: 'MoveEntity',
        entityId: LOCATION_C_ID,
        position: { x: 330, y: 340 },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.auditEvent).toMatchObject({
      eventId: 'cmd-audit',
      actorKind: 'user',
      actorRef: 'tester',
      source: 'test',
      correlationId: 'corr-cmd-audit',
      schemaVersion: 1,
    });

    for (const required of [
      'scene_closed',
      'location_discovered',
      'knowledge_changed',
      'npc_state_changed',
      'faction_control_changed',
      'route_state_changed',
      'rumor_shared',
    ] as const) {
      expect(WORLD_EVENT_KINDS).toContain(required);
    }
  });

  it('supports a multi-command LIFO undo/redo chain without losing ordering', () => {
    const first = executeWithHistory(
      document(),
      createCommandHistory(),
      command('cmd-chain-move', {
        kind: 'MoveEntity',
        entityId: LOCATION_A_ID,
        position: { x: 210, y: 220 },
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = executeWithHistory(
      first.document,
      first.history,
      command('cmd-chain-update', {
        kind: 'UpdateProperty',
        entityId: LOCATION_A_ID,
        property: 'name',
        mutation: { operation: 'set', value: 'Qinghe em Obras' },
      }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const third = executeWithHistory(
      second.document,
      second.history,
      command('cmd-chain-connect', {
        kind: 'ConnectRoute',
        routeId: NEW_ROUTE_ID,
        fromLocationId: LOCATION_B_ID,
        toLocationId: LOCATION_C_ID,
        routeKind: 'trail',
        bidirectional: true,
        tags: [],
      }),
    );
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.history.past).toHaveLength(3);

    const undo3 = undoWithHistory(third.document, third.history, meta('undo-chain-3'));
    expect(undo3.ok).toBe(true);
    if (!undo3.ok) return;
    expect(undo3.document.entities.some((item) => item.id === NEW_ROUTE_ID)).toBe(false);

    const undo2 = undoWithHistory(undo3.document, undo3.history, meta('undo-chain-2'));
    expect(undo2.ok).toBe(true);
    if (!undo2.ok) return;
    expect(entity<LocationEntity>(undo2.document, LOCATION_A_ID).name).toBe('Vila Qinghe');

    const undo1 = undoWithHistory(undo2.document, undo2.history, meta('undo-chain-1'));
    expect(undo1.ok).toBe(true);
    if (!undo1.ok) return;
    expect(entity<LocationEntity>(undo1.document, LOCATION_A_ID).position).toEqual(
      locationA.position,
    );
    expect(undo1.history.past).toHaveLength(0);
    expect(undo1.history.future).toHaveLength(3);

    const redo1 = redoWithHistory(undo1.document, undo1.history, meta('redo-chain-1'));
    expect(redo1.ok).toBe(true);
    if (!redo1.ok) return;
    expect(entity<LocationEntity>(redo1.document, LOCATION_A_ID).position).toEqual({
      x: 210,
      y: 220,
    });

    const redo2 = redoWithHistory(redo1.document, redo1.history, meta('redo-chain-2'));
    expect(redo2.ok).toBe(true);
    if (!redo2.ok) return;
    expect(entity<LocationEntity>(redo2.document, LOCATION_A_ID).name).toBe('Qinghe em Obras');

    const redo3 = redoWithHistory(redo2.document, redo2.history, meta('redo-chain-3'));
    expect(redo3.ok).toBe(true);
    if (!redo3.ok) return;
    expect(redo3.document.entities.some((item) => item.id === NEW_ROUTE_ID)).toBe(true);
    expect(redo3.history.past).toHaveLength(3);
    expect(redo3.history.future).toHaveLength(0);
  });

  it('clears the redo branch only after a new command commits successfully', () => {
    const moved = executeWithHistory(
      document(),
      createCommandHistory(),
      command('cmd-branch-move', {
        kind: 'MoveEntity',
        entityId: LOCATION_C_ID,
        position: { x: 360, y: 370 },
      }),
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const undone = undoWithHistory(moved.document, moved.history, meta('cmd-branch-undo'));
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.history.future).toHaveLength(1);

    const failed = executeWithHistory(
      undone.document,
      undone.history,
      command('cmd-branch-fail', {
        kind: 'UpdateProperty',
        entityId: LOCATION_C_ID,
        property: 'id',
        mutation: { operation: 'set', value: 'forbidden' },
      }),
    );
    expect(failed.ok).toBe(false);
    expect(failed.document).toBe(undone.document);
    expect(failed.history).toBe(undone.history);
    expect(failed.history.future).toHaveLength(1);

    const committed = executeWithHistory(
      undone.document,
      undone.history,
      command('cmd-branch-new', {
        kind: 'UpdateProperty',
        entityId: LOCATION_C_ID,
        property: 'name',
        mutation: { operation: 'set', value: 'Poço Catalogado' },
      }),
    );
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(committed.history.future).toHaveLength(0);

    const noRedo = redoWithHistory(committed.document, committed.history, meta('cmd-no-redo'));
    expect(noRedo).toMatchObject({ ok: false, error: { code: 'history_empty' } });
  });

  it('rejects malformed metadata before touching the document', () => {
    const original = document();
    const result = applyWorldCommand(original, {
      meta: { ...meta('cmd-invalid-meta'), correlationId: '' },
      payload: {
        kind: 'MoveEntity',
        entityId: LOCATION_C_ID,
        position: { x: 1, y: 2 },
      },
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_metadata' } });
    expect(entity<LocationEntity>(original, LOCATION_C_ID).position).toEqual(locationC.position);
  });
});
