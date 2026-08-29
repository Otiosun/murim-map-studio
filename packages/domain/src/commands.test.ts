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
});
