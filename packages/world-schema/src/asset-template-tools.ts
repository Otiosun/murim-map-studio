import {
  ASSET_KINDS,
  ASSET_MEDIA_TYPES,
  type AssetManifest,
  type EntityId,
  type EntityType,
  type IsoTimestamp,
  type JsonObject,
  type TemplateEntity,
  type WorldEntity,
} from '@murim/domain';
import { z } from 'zod';
import { worldEntitySchema, worldPointSchema } from './schemas';

export const MAX_ASSET_UPLOAD_BYTES = 5 * 1024 * 1024;

const positiveSizeSchema = z
  .object({ width: z.number().finite().positive(), height: z.number().finite().positive() })
  .strict();

export const assetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    contentHash: z.string().min(1),
    kind: z.enum(ASSET_KINDS),
    mediaType: z.enum(ASSET_MEDIA_TYPES),
    source: z.string().min(1),
    tags: z.array(z.string().min(1)),
    dimensions: positiveSizeSchema.optional(),
    anchor: worldPointSchema.optional(),
    defaultSize: positiveSizeSchema.optional(),
    attribution: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
  })
  .strict();

export function parseAssetManifest(input: unknown): AssetManifest {
  return assetManifestSchema.parse(input) as AssetManifest;
}

export interface AssetUploadCandidate {
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

export type AssetUploadValidation =
  | {
      ok: true;
      mediaType: (typeof ASSET_MEDIA_TYPES)[number];
      requiresSvgSanitization: boolean;
    }
  | { ok: false; issues: string[] };

const EXTENSION_BY_MEDIA_TYPE: Record<(typeof ASSET_MEDIA_TYPES)[number], readonly string[]> = {
  'image/svg+xml': ['.svg'],
  'image/webp': ['.webp'],
  'image/png': ['.png'],
};

export function validateAssetUploadCandidate(
  candidate: AssetUploadCandidate,
): AssetUploadValidation {
  const issues: string[] = [];
  const mediaType = ASSET_MEDIA_TYPES.find((item) => item === candidate.mediaType);

  if (!mediaType) issues.push(`Unsupported media type: ${candidate.mediaType || '(empty)'}.`);
  if (!Number.isInteger(candidate.sizeBytes) || candidate.sizeBytes <= 0) {
    issues.push('Asset size must be a positive integer number of bytes.');
  } else if (candidate.sizeBytes > MAX_ASSET_UPLOAD_BYTES) {
    issues.push(`Asset exceeds the ${MAX_ASSET_UPLOAD_BYTES} byte V0 limit.`);
  }

  if (mediaType) {
    const normalizedName = candidate.fileName.trim().toLowerCase();
    if (!EXTENSION_BY_MEDIA_TYPE[mediaType].some((extension) => normalizedName.endsWith(extension))) {
      issues.push(`File extension does not match declared media type ${mediaType}.`);
    }
  }

  if (issues.length > 0 || !mediaType) return { ok: false, issues };
  return {
    ok: true,
    mediaType,
    requiresSvgSanitization: mediaType === 'image/svg+xml',
  };
}

export const TEMPLATABLE_ENTITY_TYPES = [
  'location',
  'npc',
  'faction',
  'resource-site',
  'opportunity',
] as const satisfies readonly EntityType[];

export type TemplatableEntityType = (typeof TEMPLATABLE_ENTITY_TYPES)[number];

const PROTECTED_TEMPLATE_KEYS = new Set([
  'id',
  'type',
  'schemaVersion',
  'createdAt',
  'updatedAt',
  'worldId',
]);

function assertTemplatePayloadSafe(payload: JsonObject, label: string): void {
  const protectedKeys = Object.keys(payload).filter((key) => PROTECTED_TEMPLATE_KEYS.has(key));
  if (protectedKeys.length > 0) {
    throw new Error(`${label} cannot set protected identity keys: ${protectedKeys.join(', ')}.`);
  }
}

export interface TemplateInstantiationInput {
  id: EntityId;
  worldId: EntityId;
  createdAt: IsoTimestamp;
  updatedAt?: IsoTimestamp;
  overrides?: JsonObject;
}

export function instantiateTemplateEntity(
  template: TemplateEntity,
  input: TemplateInstantiationInput,
): WorldEntity {
  if (!TEMPLATABLE_ENTITY_TYPES.some((type) => type === template.entityType)) {
    throw new Error(`Entity type ${template.entityType} is not templatable in Foundation V0.`);
  }

  assertTemplatePayloadSafe(template.defaults, 'Template defaults');
  assertTemplatePayloadSafe(input.overrides ?? {}, 'Template overrides');

  const candidate = {
    ...template.defaults,
    ...(input.overrides ?? {}),
    id: input.id,
    type: template.entityType,
    schemaVersion: 1,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    worldId: input.worldId,
  };

  return worldEntitySchema.parse(candidate) as WorldEntity;
}
