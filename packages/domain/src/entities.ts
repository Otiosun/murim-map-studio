import type { ApproximateLocation, AreaGeometry, PolylineGeometry, WorldPoint } from './geometry';
import type { JsonObject } from './json';

export const ENTITY_TYPES = [
  'world',
  'ring',
  'sector',
  'area',
  'location',
  'route',
  'npc',
  'faction',
  'resource-site',
  'opportunity',
  'case',
  'knowledge-fact',
  'player-knowledge',
  'scene-closure',
  'world-event',
  'asset',
  'template',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type EntityId = string;
export type IsoTimestamp = string;

export interface BaseEntity<TType extends EntityType> {
  id: EntityId;
  type: TType;
  schemaVersion: 1;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface WorldScopedEntity<TType extends EntityType> extends BaseEntity<TType> {
  worldId: EntityId;
}

export interface WorldEntityRoot extends BaseEntity<'world'> {
  name: string;
  coordinateSystem: {
    kind: 'planar';
    unit: 'world-unit';
    origin: WorldPoint;
  };
}

export interface RingEntity extends WorldScopedEntity<'ring'> {
  name: string;
  depth: number;
  center: WorldPoint;
  innerRadius: number;
  outerRadius: number;
  tags: string[];
}

export interface SectorEntity extends WorldScopedEntity<'sector'> {
  ringId: EntityId;
  name: string;
  geometry: AreaGeometry;
  tags: string[];
}

export interface AreaEntity extends WorldScopedEntity<'area'> {
  sectorId?: EntityId;
  name: string;
  areaKind: string;
  geometry: AreaGeometry;
  tags: string[];
}

export interface LocationEntity extends WorldScopedEntity<'location'> {
  areaId?: EntityId;
  name: string;
  locationKind: string;
  position: WorldPoint;
  assetId?: EntityId;
  tags: string[];
}

export interface RouteEntity extends WorldScopedEntity<'route'> {
  fromLocationId: EntityId;
  toLocationId: EntityId;
  routeKind: string;
  path: PolylineGeometry;
  bidirectional: boolean;
  tags: string[];
}

export interface NpcEntity extends WorldScopedEntity<'npc'> {
  name: string;
  homeLocationId?: EntityId;
  factionIds: EntityId[];
  tags: string[];
}

export interface FactionEntity extends WorldScopedEntity<'faction'> {
  name: string;
  headquartersLocationId?: EntityId;
  tags: string[];
}

export interface ResourceSiteEntity extends WorldScopedEntity<'resource-site'> {
  locationId?: EntityId;
  position: WorldPoint;
  resourceKind: string;
  tags: string[];
}

export type OpportunityState = 'available' | 'dormant' | 'blocked' | 'consumed';

export interface OpportunityEntity extends WorldScopedEntity<'opportunity'> {
  locationId?: EntityId;
  name: string;
  opportunityKind: string;
  state: OpportunityState;
  tags: string[];
}

export type CaseState =
  | 'available'
  | 'open'
  | 'active'
  | 'paused'
  | 'resolved'
  | 'failed'
  | 'escalated'
  | 'transformed'
  | 'archived';

export interface CaseEntity extends WorldScopedEntity<'case'> {
  name: string;
  state: CaseState;
  locationIds: EntityId[];
  npcIds: EntityId[];
  tags: string[];
}

export interface KnowledgeFactEntity extends WorldScopedEntity<'knowledge-fact'> {
  subjectEntityId?: EntityId;
  factKind: string;
  statement: string;
  tags: string[];
}

export const KNOWLEDGE_STATES = [
  'rumor',
  'indication',
  'localized',
  'confirmed',
  'investigated',
  'understood',
] as const;

export type KnowledgeState = (typeof KNOWLEDGE_STATES)[number];

export type KnowledgeTarget =
  | { kind: 'entity'; entityId: EntityId }
  | { kind: 'fact'; factId: EntityId }
  | { kind: 'ghost'; ghostKey: string };

export type KnowledgeSourceKind =
  'system' | 'exploration' | 'npc' | 'player' | 'document' | 'scene';

export interface KnowledgeSource {
  kind: KnowledgeSourceKind;
  sourceRef?: string;
}

export interface PlayerKnowledgeEntity extends WorldScopedEntity<'player-knowledge'> {
  ownerId: string;
  target: KnowledgeTarget;
  state: KnowledgeState;
  confidence: number;
  source: KnowledgeSource;
  discoveredAt: IsoTimestamp;
  approximateLocation?: ApproximateLocation;
  privateNote?: string;
}

export type SceneClosureStatus = 'partial' | 'final';

export interface SceneClosureEntity extends WorldScopedEntity<'scene-closure'> {
  caseId?: EntityId;
  closureKey: string;
  status: SceneClosureStatus;
  summary: string;
  occurredAt: IsoTimestamp;
  outcome: JsonObject;
}

export interface WorldEventEntity extends WorldScopedEntity<'world-event'> {
  eventKind: string;
  occurredAt: IsoTimestamp;
  actorEntityId?: EntityId;
  correlationId?: string;
  payload: JsonObject;
}

export interface AssetEntity extends BaseEntity<'asset'> {
  name: string;
  assetKind: string;
  version: string;
  contentHash: string;
  source: string;
  tags: string[];
  dimensions?: { width: number; height: number };
  anchor?: WorldPoint;
  defaultSize?: { width: number; height: number };
}

export interface TemplateEntity extends BaseEntity<'template'> {
  name: string;
  entityType: EntityType;
  defaults: JsonObject;
  tags: string[];
}

export type WorldEntity =
  | WorldEntityRoot
  | RingEntity
  | SectorEntity
  | AreaEntity
  | LocationEntity
  | RouteEntity
  | NpcEntity
  | FactionEntity
  | ResourceSiteEntity
  | OpportunityEntity
  | CaseEntity
  | KnowledgeFactEntity
  | PlayerKnowledgeEntity
  | SceneClosureEntity
  | WorldEventEntity
  | AssetEntity
  | TemplateEntity;
