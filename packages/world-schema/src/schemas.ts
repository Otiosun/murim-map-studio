import { z } from 'zod';
import { ENTITY_TYPES, KNOWLEDGE_STATES, validateWorldDocument } from '@murim/domain';
import type { WorldDocument, WorldEntity } from '@murim/domain';
import {
  PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH,
  PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH,
} from '@murim/map-renderer';
import type { MapProjection } from '@murim/map-renderer';

const entityIdSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const nonEmptyString = z.string().min(1);
const tagListSchema = z.array(nonEmptyString);
const jsonObjectSchema = z.record(z.string(), z.json());

export const worldPointSchema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();

export const pointGeometrySchema = z
  .object({ kind: z.literal('point'), point: worldPointSchema })
  .strict();

export const polylineGeometrySchema = z
  .object({ kind: z.literal('polyline'), points: z.array(worldPointSchema).min(2) })
  .strict();

export const polygonGeometrySchema = z
  .object({ kind: z.literal('polygon'), vertices: z.array(worldPointSchema).min(3) })
  .strict();

export const multiPolygonGeometrySchema = z
  .object({ kind: z.literal('multi-polygon'), polygons: z.array(polygonGeometrySchema).min(1) })
  .strict();

export const areaGeometrySchema = z.discriminatedUnion('kind', [
  polygonGeometrySchema,
  multiPolygonGeometrySchema,
]);

const approximateLocationSchema = z
  .object({ center: worldPointSchema, radius: z.number().finite().positive() })
  .strict();

const baseEntityShape = {
  id: entityIdSchema,
  schemaVersion: z.literal(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};

const worldScopedShape = { worldId: entityIdSchema };

const worldSchema = z
  .object({
    ...baseEntityShape,
    type: z.literal('world'),
    name: nonEmptyString,
    coordinateSystem: z
      .object({
        kind: z.literal('planar'),
        unit: z.literal('world-unit'),
        origin: worldPointSchema,
      })
      .strict(),
  })
  .strict();

const ringSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('ring'),
    name: nonEmptyString,
    depth: z.number().int().nonnegative(),
    center: worldPointSchema,
    innerRadius: z.number().finite().nonnegative(),
    outerRadius: z.number().finite().positive(),
    tags: tagListSchema,
  })
  .strict();

const sectorSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('sector'),
    ringId: entityIdSchema,
    name: nonEmptyString,
    geometry: areaGeometrySchema,
    tags: tagListSchema,
  })
  .strict();

const areaSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('area'),
    sectorId: entityIdSchema.optional(),
    name: nonEmptyString,
    areaKind: nonEmptyString,
    geometry: areaGeometrySchema,
    tags: tagListSchema,
  })
  .strict();

const locationSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('location'),
    areaId: entityIdSchema.optional(),
    name: nonEmptyString,
    locationKind: nonEmptyString,
    position: worldPointSchema,
    assetId: entityIdSchema.optional(),
    tags: tagListSchema,
  })
  .strict();

const routeSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('route'),
    fromLocationId: entityIdSchema,
    toLocationId: entityIdSchema,
    routeKind: nonEmptyString,
    path: polylineGeometrySchema,
    bidirectional: z.boolean(),
    tags: tagListSchema,
  })
  .strict();

const npcSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('npc'),
    name: nonEmptyString,
    homeLocationId: entityIdSchema.optional(),
    factionIds: z.array(entityIdSchema),
    tags: tagListSchema,
  })
  .strict();

const factionSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('faction'),
    name: nonEmptyString,
    headquartersLocationId: entityIdSchema.optional(),
    tags: tagListSchema,
  })
  .strict();

const resourceSiteSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('resource-site'),
    locationId: entityIdSchema.optional(),
    position: worldPointSchema,
    resourceKind: nonEmptyString,
    tags: tagListSchema,
  })
  .strict();

const opportunitySchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('opportunity'),
    locationId: entityIdSchema.optional(),
    name: nonEmptyString,
    opportunityKind: nonEmptyString,
    state: z.enum(['available', 'dormant', 'blocked', 'consumed']),
    tags: tagListSchema,
  })
  .strict();

const caseSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('case'),
    name: nonEmptyString,
    state: z.enum([
      'available',
      'open',
      'active',
      'paused',
      'resolved',
      'failed',
      'escalated',
      'transformed',
      'archived',
    ]),
    locationIds: z.array(entityIdSchema),
    npcIds: z.array(entityIdSchema),
    tags: tagListSchema,
  })
  .strict();

const knowledgeFactSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('knowledge-fact'),
    subjectEntityId: entityIdSchema.optional(),
    factKind: nonEmptyString,
    statement: nonEmptyString,
    tags: tagListSchema,
  })
  .strict();

const knowledgeTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entity'), entityId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('fact'), factId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('ghost'), ghostKey: nonEmptyString }).strict(),
]);

const knowledgeSourceSchema = z
  .object({
    kind: z.enum(['system', 'exploration', 'npc', 'player', 'document', 'scene']),
    sourceRef: nonEmptyString.optional(),
  })
  .strict();

const playerKnowledgeSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('player-knowledge'),
    ownerId: nonEmptyString,
    target: knowledgeTargetSchema,
    state: z.enum(KNOWLEDGE_STATES),
    confidence: z.number().min(0).max(1),
    source: knowledgeSourceSchema,
    discoveredAt: timestampSchema,
    approximateLocation: approximateLocationSchema.optional(),
    privateNote: z.string().optional(),
  })
  .strict();

const sceneClosureSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('scene-closure'),
    caseId: entityIdSchema.optional(),
    closureKey: nonEmptyString,
    status: z.enum(['partial', 'final']),
    summary: nonEmptyString,
    occurredAt: timestampSchema,
    outcome: jsonObjectSchema,
  })
  .strict();

const worldEventSchema = z
  .object({
    ...baseEntityShape,
    ...worldScopedShape,
    type: z.literal('world-event'),
    eventKind: nonEmptyString,
    occurredAt: timestampSchema,
    actorEntityId: entityIdSchema.optional(),
    correlationId: nonEmptyString.optional(),
    payload: jsonObjectSchema,
  })
  .strict();

const sizeSchema = z
  .object({ width: z.number().finite().positive(), height: z.number().finite().positive() })
  .strict();

const assetSchema = z
  .object({
    ...baseEntityShape,
    type: z.literal('asset'),
    name: nonEmptyString,
    assetKind: nonEmptyString,
    version: nonEmptyString,
    contentHash: nonEmptyString,
    source: nonEmptyString,
    tags: tagListSchema,
    dimensions: sizeSchema.optional(),
    anchor: worldPointSchema.optional(),
    defaultSize: sizeSchema.optional(),
  })
  .strict();

const templateSchema = z
  .object({
    ...baseEntityShape,
    type: z.literal('template'),
    name: nonEmptyString,
    entityType: z.enum(ENTITY_TYPES),
    defaults: jsonObjectSchema,
    tags: tagListSchema,
  })
  .strict();

export const worldEntitySchema = z.discriminatedUnion('type', [
  worldSchema,
  ringSchema,
  sectorSchema,
  areaSchema,
  locationSchema,
  routeSchema,
  npcSchema,
  factionSchema,
  resourceSiteSchema,
  opportunitySchema,
  caseSchema,
  knowledgeFactSchema,
  playerKnowledgeSchema,
  sceneClosureSchema,
  worldEventSchema,
  assetSchema,
  templateSchema,
]);

export const worldPackSchema = z
  .object({
    format: z.literal('murim-world-pack'),
    schemaVersion: z.literal(1),
    exportedAt: timestampSchema,
    rootWorldId: entityIdSchema,
    entities: z.array(worldEntitySchema),
  })
  .strict()
  .superRefine((pack, context) => {
    const document: WorldDocument = {
      schemaVersion: 1,
      rootWorldId: pack.rootWorldId,
      entities: pack.entities as WorldEntity[],
    };

    for (const issue of validateWorldDocument(document)) {
      context.addIssue({
        code: 'custom',
        path: issue.entityId ? ['entities'] : [],
        message: `${issue.code}: ${issue.message}`,
      });
    }
  });

const projectionBaseShape = {
  id: nonEmptyString,
  metadata: jsonObjectSchema,
};

const projectionNodeDetailSchema = z
  .object({
    category: z.string().trim().min(1).max(PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH).optional(),
    summary: z.string().trim().min(1).max(PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH).optional(),
  })
  .strict();

const projectionNodeSchema = z
  .object({
    ...projectionBaseShape,
    kind: z.literal('node'),
    position: worldPointSchema,
    role: z.enum(['known', 'ghost']),
    symbolKey: nonEmptyString,
    label: z.string().optional(),
    knowledgeState: z.enum(KNOWLEDGE_STATES).optional(),
    confidence: z.number().min(0).max(1).optional(),
    approximateLocation: approximateLocationSchema.optional(),
    detail: projectionNodeDetailSchema.optional(),
  })
  .strict();

const projectionRouteSchema = z
  .object({
    ...projectionBaseShape,
    kind: z.literal('route'),
    fromItemId: nonEmptyString,
    toItemId: nonEmptyString,
    path: polylineGeometrySchema,
    styleKey: nonEmptyString,
    label: z.string().optional(),
    knowledgeState: z.enum(KNOWLEDGE_STATES).optional(),
  })
  .strict();

const projectionAreaSchema = z
  .object({
    ...projectionBaseShape,
    kind: z.literal('area'),
    geometry: areaGeometrySchema,
    styleKey: nonEmptyString,
    label: z.string().optional(),
    knowledgeState: z.enum(KNOWLEDGE_STATES).optional(),
  })
  .strict();

const projectionRingSchema = z
  .object({
    ...projectionBaseShape,
    kind: z.literal('ring'),
    center: worldPointSchema,
    innerRadius: z.number().finite().nonnegative(),
    outerRadius: z.number().finite().positive(),
    styleKey: nonEmptyString,
    label: z.string().optional(),
  })
  .strict();

const projectionAnnotationSchema = z
  .object({
    ...projectionBaseShape,
    kind: z.literal('annotation'),
    position: worldPointSchema,
    text: nonEmptyString,
    annotationKind: z.enum(['private-note', 'system']),
  })
  .strict();

export const mapProjectionSchema = z
  .object({
    projectionVersion: z.literal(1),
    mapKey: nonEmptyString,
    generatedAt: timestampSchema,
    items: z.array(
      z.discriminatedUnion('kind', [
        projectionNodeSchema,
        projectionRouteSchema,
        projectionAreaSchema,
        projectionRingSchema,
        projectionAnnotationSchema,
      ]),
    ),
  })
  .strict();

export type WorldPack = z.infer<typeof worldPackSchema>;

export function parseWorldPack(input: unknown): WorldPack {
  return worldPackSchema.parse(input);
}

export function serializeWorldPack(pack: WorldPack): string {
  return JSON.stringify(worldPackSchema.parse(pack));
}

export function deserializeWorldPack(serialized: string): WorldPack {
  return worldPackSchema.parse(JSON.parse(serialized) as unknown);
}

export function parseMapProjection(input: unknown): MapProjection {
  return mapProjectionSchema.parse(input) as MapProjection;
}
