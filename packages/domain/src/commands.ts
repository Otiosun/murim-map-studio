import type { WorldDocument } from './document';
import {
  CASE_STATES,
  ENTITY_TYPES,
  KNOWLEDGE_STATES,
  OPPORTUNITY_STATES,
  type EntityId,
  type EntityType,
  type IsoTimestamp,
  type RouteEntity,
  type WorldEntity,
} from './entities';
import type { PolylineGeometry, WorldPoint } from './geometry';
import type { JsonObject, JsonValue } from './json';
import { validateWorldDocument, type DomainIssue } from './invariants';

export const COMMAND_SOURCES = ['studio', 'system', 'scene', 'import', 'test'] as const;
export type CommandSource = (typeof COMMAND_SOURCES)[number];

export interface CommandActor {
  kind: 'user' | 'system' | 'entity';
  ref: string;
}

export interface CommandMetadata {
  commandId: string;
  issuedAt: IsoTimestamp;
  source: CommandSource;
  actor: CommandActor;
  correlationId: string;
}

export type PropertyMutation = { operation: 'set'; value: JsonValue } | { operation: 'unset' };

export interface CreateEntityCommand {
  kind: 'CreateEntity';
  entity: WorldEntity;
}

export interface MoveEntityCommand {
  kind: 'MoveEntity';
  entityId: EntityId;
  position: WorldPoint;
}

export interface UpdatePropertyCommand {
  kind: 'UpdateProperty';
  entityId: EntityId;
  property: string;
  mutation: PropertyMutation;
}

export interface ConnectRouteCommand {
  kind: 'ConnectRoute';
  routeId: EntityId;
  fromLocationId: EntityId;
  toLocationId: EntityId;
  routeKind: string;
  bidirectional: boolean;
  tags: string[];
  path?: PolylineGeometry;
}

export interface DeleteEntityCommand {
  kind: 'DeleteEntity';
  entityId: EntityId;
}

export interface RestoreEntityCommand {
  kind: 'RestoreEntity';
  entity: WorldEntity;
}

export type CommandPayload =
  | CreateEntityCommand
  | MoveEntityCommand
  | UpdatePropertyCommand
  | ConnectRouteCommand
  | DeleteEntityCommand
  | RestoreEntityCommand;

export interface WorldCommand {
  meta: CommandMetadata;
  payload: CommandPayload;
}

export const WORLD_EVENT_KINDS = [
  'entity_created',
  'entity_moved',
  'entity_updated',
  'entity_deleted',
  'entity_restored',
  'route_connected',
  'scene_closed',
  'location_discovered',
  'knowledge_changed',
  'npc_state_changed',
  'faction_control_changed',
  'route_state_changed',
  'rumor_shared',
] as const;

export type WorldEventKind = (typeof WORLD_EVENT_KINDS)[number];

export interface CommandAuditEvent {
  eventId: string;
  worldId: EntityId;
  eventKind: WorldEventKind;
  occurredAt: IsoTimestamp;
  actorKind: CommandActor['kind'];
  actorRef: string;
  source: CommandSource;
  correlationId: string;
  schemaVersion: 1;
  payload: JsonObject;
}

export type CommandErrorCode =
  | 'invalid_metadata'
  | 'entity_not_found'
  | 'wrong_entity_type'
  | 'entity_not_movable'
  | 'unsupported_property'
  | 'invalid_property_value'
  | 'property_not_unsettable'
  | 'invariant_violation';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  issues?: DomainIssue[];
}

export interface CommandApplySuccess {
  ok: true;
  document: WorldDocument;
  inverse: CommandPayload;
  changedEntityIds: EntityId[];
  auditEvent: CommandAuditEvent;
}

export interface CommandApplyFailure {
  ok: false;
  error: CommandError;
}

export type CommandApplyResult = CommandApplySuccess | CommandApplyFailure;

interface PropertyRule {
  validate: (value: JsonValue) => boolean;
  canUnset?: boolean;
}

const isString = (value: JsonValue): boolean => typeof value === 'string';
const isBoolean = (value: JsonValue): boolean => typeof value === 'boolean';
const isFiniteNumber = (value: JsonValue): boolean =>
  typeof value === 'number' && Number.isFinite(value);
const isNonNegativeInteger = (value: JsonValue): boolean =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
const isConfidence = (value: JsonValue): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isStringArray = (value: JsonValue): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isEntityType = (value: JsonValue): boolean =>
  typeof value === 'string' && ENTITY_TYPES.some((type) => type === value);
const oneOf =
  (values: readonly string[]) =>
  (value: JsonValue): boolean =>
    typeof value === 'string' && values.includes(value);

const stringRule: PropertyRule = { validate: isString };
const optionalStringRule: PropertyRule = { validate: isString, canUnset: true };
const tagsRule: PropertyRule = { validate: isStringArray };

const EDITABLE_PROPERTIES: Record<EntityType, Record<string, PropertyRule>> = {
  world: {
    name: stringRule,
  },
  ring: {
    name: stringRule,
    depth: { validate: isNonNegativeInteger },
    innerRadius: { validate: isFiniteNumber },
    outerRadius: { validate: isFiniteNumber },
    tags: tagsRule,
  },
  sector: {
    name: stringRule,
    tags: tagsRule,
  },
  area: {
    name: stringRule,
    areaKind: stringRule,
    tags: tagsRule,
  },
  location: {
    name: stringRule,
    locationKind: stringRule,
    areaId: optionalStringRule,
    assetId: optionalStringRule,
    tags: tagsRule,
  },
  route: {
    routeKind: stringRule,
    bidirectional: { validate: isBoolean },
    tags: tagsRule,
  },
  npc: {
    name: stringRule,
    homeLocationId: optionalStringRule,
    factionIds: { validate: isStringArray },
    tags: tagsRule,
  },
  faction: {
    name: stringRule,
    headquartersLocationId: optionalStringRule,
    tags: tagsRule,
  },
  'resource-site': {
    resourceKind: stringRule,
    locationId: optionalStringRule,
    tags: tagsRule,
  },
  opportunity: {
    name: stringRule,
    opportunityKind: stringRule,
    locationId: optionalStringRule,
    state: { validate: oneOf(OPPORTUNITY_STATES) },
    tags: tagsRule,
  },
  case: {
    name: stringRule,
    state: { validate: oneOf(CASE_STATES) },
    locationIds: { validate: isStringArray },
    npcIds: { validate: isStringArray },
    tags: tagsRule,
  },
  'knowledge-fact': {
    factKind: stringRule,
    statement: stringRule,
    subjectEntityId: optionalStringRule,
    tags: tagsRule,
  },
  'player-knowledge': {
    state: { validate: oneOf(KNOWLEDGE_STATES) },
    confidence: { validate: isConfidence },
    privateNote: optionalStringRule,
  },
  'scene-closure': {
    caseId: optionalStringRule,
    status: { validate: oneOf(['partial', 'final']) },
    summary: stringRule,
  },
  'world-event': {
    eventKind: stringRule,
    actorEntityId: optionalStringRule,
    correlationId: optionalStringRule,
  },
  asset: {
    name: stringRule,
    assetKind: stringRule,
    version: stringRule,
    contentHash: stringRule,
    source: stringRule,
    tags: tagsRule,
  },
  template: {
    name: stringRule,
    entityType: { validate: isEntityType },
    tags: tagsRule,
  },
};

function metadataError(meta: CommandMetadata): CommandApplyFailure | null {
  if (
    meta.commandId.trim().length === 0 ||
    meta.correlationId.trim().length === 0 ||
    meta.actor.ref.trim().length === 0 ||
    !Number.isFinite(Date.parse(meta.issuedAt))
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid_metadata',
        message: 'Command metadata requires non-empty IDs/actor and a valid issuedAt timestamp.',
      },
    };
  }

  return null;
}

function entityById(document: WorldDocument, entityId: EntityId): WorldEntity | undefined {
  return document.entities.find((entity) => entity.id === entityId);
}

function worldIdForEntity(document: WorldDocument, entity: WorldEntity): EntityId {
  return 'worldId' in entity ? entity.worldId : document.rootWorldId;
}

function auditEvent(
  document: WorldDocument,
  command: WorldCommand,
  eventKind: WorldEventKind,
  entity: WorldEntity,
  changedEntityIds: EntityId[],
  details: JsonObject = {},
): CommandAuditEvent {
  return {
    eventId: command.meta.commandId,
    worldId: worldIdForEntity(document, entity),
    eventKind,
    occurredAt: command.meta.issuedAt,
    actorKind: command.meta.actor.kind,
    actorRef: command.meta.actor.ref,
    source: command.meta.source,
    correlationId: command.meta.correlationId,
    schemaVersion: 1,
    payload: {
      commandKind: command.payload.kind,
      entityId: entity.id,
      entityType: entity.type,
      changedEntityIds,
      ...details,
    },
  };
}

function invariantResult(
  document: WorldDocument,
  inverse: CommandPayload,
  changedEntityIds: EntityId[],
  event: CommandAuditEvent,
): CommandApplyResult {
  const issues = validateWorldDocument(document);
  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        code: 'invariant_violation',
        message: 'Command would leave the world document in an invalid state.',
        issues,
      },
    };
  }

  return { ok: true, document, inverse, changedEntityIds, auditEvent: event };
}

function updatedEntity(entity: WorldEntity, issuedAt: IsoTimestamp): WorldEntity {
  return { ...entity, updatedAt: issuedAt } as WorldEntity;
}

function applyCreate(
  document: WorldDocument,
  command: WorldCommand & { payload: CreateEntityCommand },
): CommandApplyResult {
  const entity = updatedEntity(structuredClone(command.payload.entity), command.meta.issuedAt);
  const nextDocument: WorldDocument = {
    ...document,
    entities: [...document.entities, entity],
  };
  const changedEntityIds = [entity.id];

  return invariantResult(
    nextDocument,
    { kind: 'DeleteEntity', entityId: entity.id },
    changedEntityIds,
    auditEvent(document, command, 'entity_created', entity, changedEntityIds),
  );
}

function applyMove(
  document: WorldDocument,
  command: WorldCommand & { payload: MoveEntityCommand },
): CommandApplyResult {
  const target = entityById(document, command.payload.entityId);
  if (!target) {
    return {
      ok: false,
      error: {
        code: 'entity_not_found',
        message: `Entity ${command.payload.entityId} does not exist.`,
      },
    };
  }

  if (target.type !== 'location' && target.type !== 'resource-site') {
    return {
      ok: false,
      error: {
        code: 'entity_not_movable',
        message: `MoveEntity V0 supports location and resource-site, not ${target.type}.`,
      },
    };
  }

  const previousPosition = structuredClone(target.position);
  const nextPosition = structuredClone(command.payload.position);
  const changed = new Set<EntityId>([target.id]);

  const entities = document.entities.map((entity) => {
    if (
      entity.id === target.id &&
      (entity.type === 'location' || entity.type === 'resource-site')
    ) {
      return { ...entity, position: nextPosition, updatedAt: command.meta.issuedAt };
    }

    if (target.type === 'location' && entity.type === 'route') {
      const touchesFrom = entity.fromLocationId === target.id;
      const touchesTo = entity.toLocationId === target.id;
      if (!touchesFrom && !touchesTo) {
        return entity;
      }

      const points = entity.path.points.map((point) => structuredClone(point));
      if (touchesFrom && points.length > 0) {
        points[0] = structuredClone(nextPosition);
      }
      if (touchesTo && points.length > 0) {
        points[points.length - 1] = structuredClone(nextPosition);
      }
      changed.add(entity.id);
      return {
        ...entity,
        path: { ...entity.path, points },
        updatedAt: command.meta.issuedAt,
      };
    }

    return entity;
  });

  const nextDocument: WorldDocument = { ...document, entities };
  const changedEntityIds = [...changed];

  return invariantResult(
    nextDocument,
    { kind: 'MoveEntity', entityId: target.id, position: previousPosition },
    changedEntityIds,
    auditEvent(document, command, 'entity_moved', target, changedEntityIds, {
      from: { x: previousPosition.x, y: previousPosition.y },
      to: { x: nextPosition.x, y: nextPosition.y },
    }),
  );
}

function applyUpdateProperty(
  document: WorldDocument,
  command: WorldCommand & { payload: UpdatePropertyCommand },
): CommandApplyResult {
  const target = entityById(document, command.payload.entityId);
  if (!target) {
    return {
      ok: false,
      error: {
        code: 'entity_not_found',
        message: `Entity ${command.payload.entityId} does not exist.`,
      },
    };
  }

  const rule = EDITABLE_PROPERTIES[target.type][command.payload.property];
  if (!rule) {
    return {
      ok: false,
      error: {
        code: 'unsupported_property',
        message: `${command.payload.property} is not editable through UpdateProperty for ${target.type}.`,
      },
    };
  }

  if (command.payload.mutation.operation === 'unset' && !rule.canUnset) {
    return {
      ok: false,
      error: {
        code: 'property_not_unsettable',
        message: `${command.payload.property} cannot be unset for ${target.type}.`,
      },
    };
  }

  if (
    command.payload.mutation.operation === 'set' &&
    !rule.validate(command.payload.mutation.value)
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid_property_value',
        message: `Invalid value for ${target.type}.${command.payload.property}.`,
      },
    };
  }

  const targetRecord = target as unknown as Record<string, unknown>;
  const hadProperty = Object.prototype.hasOwnProperty.call(targetRecord, command.payload.property);
  const previousValue = targetRecord[command.payload.property];
  const next = structuredClone(target) as unknown as Record<string, unknown>;

  if (command.payload.mutation.operation === 'unset') {
    delete next[command.payload.property];
  } else {
    next[command.payload.property] = structuredClone(command.payload.mutation.value);
  }
  next.updatedAt = command.meta.issuedAt;

  const nextEntity = next as unknown as WorldEntity;
  const nextDocument: WorldDocument = {
    ...document,
    entities: document.entities.map((entity) => (entity.id === target.id ? nextEntity : entity)),
  };

  const inverseMutation: PropertyMutation = hadProperty
    ? { operation: 'set', value: structuredClone(previousValue as JsonValue) }
    : { operation: 'unset' };
  const changedEntityIds = [target.id];

  return invariantResult(
    nextDocument,
    {
      kind: 'UpdateProperty',
      entityId: target.id,
      property: command.payload.property,
      mutation: inverseMutation,
    },
    changedEntityIds,
    auditEvent(document, command, 'entity_updated', target, changedEntityIds, {
      property: command.payload.property,
      operation: command.payload.mutation.operation,
    }),
  );
}

function applyConnectRoute(
  document: WorldDocument,
  command: WorldCommand & { payload: ConnectRouteCommand },
): CommandApplyResult {
  const from = entityById(document, command.payload.fromLocationId);
  const to = entityById(document, command.payload.toLocationId);

  if (!from || !to) {
    return {
      ok: false,
      error: {
        code: 'entity_not_found',
        message: 'ConnectRoute requires both endpoint locations to exist.',
      },
    };
  }

  if (from.type !== 'location' || to.type !== 'location') {
    return {
      ok: false,
      error: {
        code: 'wrong_entity_type',
        message: 'ConnectRoute endpoints must both be location entities.',
      },
    };
  }

  const route: RouteEntity = {
    id: command.payload.routeId,
    type: 'route',
    schemaVersion: 1,
    createdAt: command.meta.issuedAt,
    updatedAt: command.meta.issuedAt,
    worldId: document.rootWorldId,
    fromLocationId: from.id,
    toLocationId: to.id,
    routeKind: command.payload.routeKind,
    path: command.payload.path
      ? structuredClone(command.payload.path)
      : {
          kind: 'polyline',
          points: [structuredClone(from.position), structuredClone(to.position)],
        },
    bidirectional: command.payload.bidirectional,
    tags: [...command.payload.tags],
  };

  const nextDocument: WorldDocument = {
    ...document,
    entities: [...document.entities, route],
  };
  const changedEntityIds = [route.id];

  return invariantResult(
    nextDocument,
    { kind: 'DeleteEntity', entityId: route.id },
    changedEntityIds,
    auditEvent(document, command, 'route_connected', route, changedEntityIds, {
      fromLocationId: from.id,
      toLocationId: to.id,
    }),
  );
}

function applyDelete(
  document: WorldDocument,
  command: WorldCommand & { payload: DeleteEntityCommand },
): CommandApplyResult {
  const target = entityById(document, command.payload.entityId);
  if (!target) {
    return {
      ok: false,
      error: {
        code: 'entity_not_found',
        message: `Entity ${command.payload.entityId} does not exist.`,
      },
    };
  }

  const snapshot = structuredClone(target);
  const nextDocument: WorldDocument = {
    ...document,
    entities: document.entities.filter((entity) => entity.id !== target.id),
  };
  const changedEntityIds = [target.id];

  return invariantResult(
    nextDocument,
    { kind: 'RestoreEntity', entity: snapshot },
    changedEntityIds,
    auditEvent(document, command, 'entity_deleted', target, changedEntityIds),
  );
}

function applyRestore(
  document: WorldDocument,
  command: WorldCommand & { payload: RestoreEntityCommand },
): CommandApplyResult {
  const restored = updatedEntity(structuredClone(command.payload.entity), command.meta.issuedAt);
  const nextDocument: WorldDocument = {
    ...document,
    entities: [...document.entities, restored],
  };
  const changedEntityIds = [restored.id];

  return invariantResult(
    nextDocument,
    { kind: 'DeleteEntity', entityId: restored.id },
    changedEntityIds,
    auditEvent(document, command, 'entity_restored', restored, changedEntityIds),
  );
}

export function applyWorldCommand(
  document: WorldDocument,
  command: WorldCommand,
): CommandApplyResult {
  const invalidMetadata = metadataError(command.meta);
  if (invalidMetadata) {
    return invalidMetadata;
  }

  switch (command.payload.kind) {
    case 'CreateEntity':
      return applyCreate(document, command as WorldCommand & { payload: CreateEntityCommand });
    case 'MoveEntity':
      return applyMove(document, command as WorldCommand & { payload: MoveEntityCommand });
    case 'UpdateProperty':
      return applyUpdateProperty(
        document,
        command as WorldCommand & { payload: UpdatePropertyCommand },
      );
    case 'ConnectRoute':
      return applyConnectRoute(
        document,
        command as WorldCommand & { payload: ConnectRouteCommand },
      );
    case 'DeleteEntity':
      return applyDelete(document, command as WorldCommand & { payload: DeleteEntityCommand });
    case 'RestoreEntity':
      return applyRestore(document, command as WorldCommand & { payload: RestoreEntityCommand });
  }
}
