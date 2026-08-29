import type { AreaGeometry, WorldPoint } from './geometry';
import type { EntityId, EntityType, WorldEntity } from './entities';
import type { WorldDocument } from './document';

export type DomainIssueCode =
  | 'duplicate_id'
  | 'missing_root_world'
  | 'wrong_root_type'
  | 'foreign_world_reference'
  | 'missing_reference'
  | 'invalid_reference_type'
  | 'invalid_geometry'
  | 'invalid_ring'
  | 'invalid_confidence'
  | 'self_route';

export interface DomainIssue {
  code: DomainIssueCode;
  message: string;
  entityId?: EntityId;
  path?: string;
}

interface ReferenceSpec {
  targetId: EntityId;
  path: string;
  expectedTypes?: EntityType[];
}

function isFinitePoint(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validateAreaGeometry(geometry: AreaGeometry): boolean {
  if (geometry.kind === 'polygon') {
    return geometry.vertices.length >= 3 && geometry.vertices.every(isFinitePoint);
  }

  return (
    geometry.polygons.length > 0 &&
    geometry.polygons.every(
      (polygon) => polygon.vertices.length >= 3 && polygon.vertices.every(isFinitePoint),
    )
  );
}

function getReferences(entity: WorldEntity): ReferenceSpec[] {
  const refs: ReferenceSpec[] = [];

  if ('worldId' in entity) {
    refs.push({ targetId: entity.worldId, path: 'worldId', expectedTypes: ['world'] });
  }

  switch (entity.type) {
    case 'sector':
      refs.push({ targetId: entity.ringId, path: 'ringId', expectedTypes: ['ring'] });
      break;
    case 'area':
      if (entity.sectorId) {
        refs.push({ targetId: entity.sectorId, path: 'sectorId', expectedTypes: ['sector'] });
      }
      break;
    case 'location':
      if (entity.areaId) {
        refs.push({ targetId: entity.areaId, path: 'areaId', expectedTypes: ['area'] });
      }
      if (entity.assetId) {
        refs.push({ targetId: entity.assetId, path: 'assetId', expectedTypes: ['asset'] });
      }
      break;
    case 'route':
      refs.push(
        { targetId: entity.fromLocationId, path: 'fromLocationId', expectedTypes: ['location'] },
        { targetId: entity.toLocationId, path: 'toLocationId', expectedTypes: ['location'] },
      );
      break;
    case 'npc':
      if (entity.homeLocationId) {
        refs.push({
          targetId: entity.homeLocationId,
          path: 'homeLocationId',
          expectedTypes: ['location'],
        });
      }
      entity.factionIds.forEach((targetId, index) => {
        refs.push({ targetId, path: `factionIds.${index}`, expectedTypes: ['faction'] });
      });
      break;
    case 'faction':
      if (entity.headquartersLocationId) {
        refs.push({
          targetId: entity.headquartersLocationId,
          path: 'headquartersLocationId',
          expectedTypes: ['location'],
        });
      }
      break;
    case 'resource-site':
      if (entity.locationId) {
        refs.push({ targetId: entity.locationId, path: 'locationId', expectedTypes: ['location'] });
      }
      break;
    case 'opportunity':
      if (entity.locationId) {
        refs.push({ targetId: entity.locationId, path: 'locationId', expectedTypes: ['location'] });
      }
      break;
    case 'case':
      entity.locationIds.forEach((targetId, index) => {
        refs.push({ targetId, path: `locationIds.${index}`, expectedTypes: ['location'] });
      });
      entity.npcIds.forEach((targetId, index) => {
        refs.push({ targetId, path: `npcIds.${index}`, expectedTypes: ['npc'] });
      });
      break;
    case 'knowledge-fact':
      if (entity.subjectEntityId) {
        refs.push({ targetId: entity.subjectEntityId, path: 'subjectEntityId' });
      }
      break;
    case 'player-knowledge':
      if (entity.target.kind === 'entity') {
        refs.push({ targetId: entity.target.entityId, path: 'target.entityId' });
      } else if (entity.target.kind === 'fact') {
        refs.push({
          targetId: entity.target.factId,
          path: 'target.factId',
          expectedTypes: ['knowledge-fact'],
        });
      }
      break;
    case 'scene-closure':
      if (entity.caseId) {
        refs.push({ targetId: entity.caseId, path: 'caseId', expectedTypes: ['case'] });
      }
      break;
    case 'world-event':
      if (entity.actorEntityId) {
        refs.push({ targetId: entity.actorEntityId, path: 'actorEntityId' });
      }
      break;
    case 'world':
    case 'ring':
    case 'asset':
    case 'template':
      break;
  }

  return refs;
}

function validateGeometry(entity: WorldEntity): DomainIssue[] {
  const issues: DomainIssue[] = [];
  const invalid = (path: string, message: string): void => {
    issues.push({ code: 'invalid_geometry', entityId: entity.id, path, message });
  };

  switch (entity.type) {
    case 'world':
      if (!isFinitePoint(entity.coordinateSystem.origin)) {
        invalid('coordinateSystem.origin', 'World origin must use finite planar coordinates.');
      }
      break;
    case 'ring':
      if (!isFinitePoint(entity.center)) {
        invalid('center', 'Ring center must use finite planar coordinates.');
      }
      break;
    case 'sector':
    case 'area':
      if (!validateAreaGeometry(entity.geometry)) {
        invalid('geometry', 'Area geometry must contain finite coordinates and valid polygons.');
      }
      break;
    case 'location':
    case 'resource-site':
      if (!isFinitePoint(entity.position)) {
        invalid('position', 'Position must use finite planar coordinates.');
      }
      break;
    case 'route':
      if (entity.path.points.length < 2 || !entity.path.points.every(isFinitePoint)) {
        invalid('path', 'Route path must contain at least two finite planar points.');
      }
      break;
    case 'player-knowledge':
      if (
        entity.approximateLocation &&
        (!isFinitePoint(entity.approximateLocation.center) ||
          !Number.isFinite(entity.approximateLocation.radius) ||
          entity.approximateLocation.radius <= 0)
      ) {
        invalid(
          'approximateLocation',
          'Approximate location must have a finite center and positive finite radius.',
        );
      }
      break;
    case 'asset':
      if (
        entity.anchor &&
        (!Number.isFinite(entity.anchor.x) || !Number.isFinite(entity.anchor.y))
      ) {
        invalid('anchor', 'Asset anchor must be finite.');
      }
      if (
        entity.dimensions &&
        (!Number.isFinite(entity.dimensions.width) ||
          !Number.isFinite(entity.dimensions.height) ||
          entity.dimensions.width <= 0 ||
          entity.dimensions.height <= 0)
      ) {
        invalid('dimensions', 'Asset dimensions must be positive finite numbers.');
      }
      if (
        entity.defaultSize &&
        (!Number.isFinite(entity.defaultSize.width) ||
          !Number.isFinite(entity.defaultSize.height) ||
          entity.defaultSize.width <= 0 ||
          entity.defaultSize.height <= 0)
      ) {
        invalid('defaultSize', 'Asset default size must be positive finite numbers.');
      }
      break;
    case 'npc':
    case 'faction':
    case 'opportunity':
    case 'case':
    case 'knowledge-fact':
    case 'scene-closure':
    case 'world-event':
    case 'template':
      break;
  }

  return issues;
}

export function validateWorldDocument(document: WorldDocument): DomainIssue[] {
  const issues: DomainIssue[] = [];
  const byId = new Map<EntityId, WorldEntity>();

  for (const entity of document.entities) {
    if (byId.has(entity.id)) {
      issues.push({
        code: 'duplicate_id',
        entityId: entity.id,
        message: `Duplicate entity id: ${entity.id}`,
      });
    } else {
      byId.set(entity.id, entity);
    }
  }

  const root = byId.get(document.rootWorldId);
  if (!root) {
    issues.push({
      code: 'missing_root_world',
      message: `Root world ${document.rootWorldId} does not exist.`,
    });
  } else if (root.type !== 'world') {
    issues.push({
      code: 'wrong_root_type',
      entityId: root.id,
      message: 'rootWorldId must reference an entity of type world.',
    });
  }

  for (const entity of document.entities) {
    issues.push(...validateGeometry(entity));

    if ('worldId' in entity && entity.worldId !== document.rootWorldId) {
      issues.push({
        code: 'foreign_world_reference',
        entityId: entity.id,
        path: 'worldId',
        message: `Entity belongs to ${entity.worldId}, expected root world ${document.rootWorldId}.`,
      });
    }

    if (entity.type === 'ring') {
      if (
        !Number.isInteger(entity.depth) ||
        entity.depth < 0 ||
        !Number.isFinite(entity.innerRadius) ||
        !Number.isFinite(entity.outerRadius) ||
        entity.innerRadius < 0 ||
        entity.outerRadius <= entity.innerRadius
      ) {
        issues.push({
          code: 'invalid_ring',
          entityId: entity.id,
          message:
            'Ring depth must be a non-negative integer and outerRadius must be greater than a non-negative innerRadius.',
        });
      }
    }

    if (entity.type === 'player-knowledge' && (entity.confidence < 0 || entity.confidence > 1)) {
      issues.push({
        code: 'invalid_confidence',
        entityId: entity.id,
        path: 'confidence',
        message: 'Knowledge confidence must be between 0 and 1.',
      });
    }

    if (
      entity.type === 'route' &&
      entity.fromLocationId === entity.toLocationId
    ) {
      issues.push({
        code: 'self_route',
        entityId: entity.id,
        message: 'A route cannot connect a location to itself.',
      });
    }

    for (const reference of getReferences(entity)) {
      const target = byId.get(reference.targetId);
      if (!target) {
        issues.push({
          code: 'missing_reference',
          entityId: entity.id,
          path: reference.path,
          message: `Missing reference ${reference.targetId}.`,
        });
        continue;
      }

      if (reference.expectedTypes && !reference.expectedTypes.includes(target.type)) {
        issues.push({
          code: 'invalid_reference_type',
          entityId: entity.id,
          path: reference.path,
          message: `Reference ${reference.targetId} is ${target.type}; expected ${reference.expectedTypes.join(' | ')}.`,
        });
      }
    }
  }

  return issues;
}

export function assertValidWorldDocument(document: WorldDocument): void {
  const issues = validateWorldDocument(document);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'));
  }
}
