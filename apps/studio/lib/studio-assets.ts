import {
  searchAssetManifests,
  type AssetEntity,
  type AssetManifest,
  type TemplateEntity,
  type WorldDocument,
} from '@murim/domain';

export const STUDIO_WORLD_ID = '00000000-0000-4000-8000-000000000001';
export const LEGACY_STUDIO_WORLD_ID = 'world-murim-v0';

const BUILT_IN_CREATED_AT = '2026-08-30T00:00:00.000Z';
const MAX_IMPORTED_ASSET_BYTES = 2 * 1024 * 1024;

const ASSET_IDS = {
  village: '10000000-0000-4000-8000-000000000001',
  gate: '10000000-0000-4000-8000-000000000002',
  sect: '10000000-0000-4000-8000-000000000003',
  qi: '10000000-0000-4000-8000-000000000004',
  ruin: '10000000-0000-4000-8000-000000000005',
} as const;

export const BUILT_IN_ASSET_ENTITIES: readonly AssetEntity[] = [
  {
    id: ASSET_IDS.village,
    type: 'asset',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Vila',
    assetKind: 'symbol',
    version: '1.0.0',
    contentHash: 'sha256:cfeb5f979c9265e6da04febe87e661f3fdb075c8341306668e66b39ae7312830',
    source: '/assets/murim/village.svg',
    tags: ['vila', 'social', 'assentamento', 'murim'],
    dimensions: { width: 64, height: 64 },
    anchor: { x: 32, y: 32 },
    defaultSize: { width: 42, height: 42 },
  },
  {
    id: ASSET_IDS.gate,
    type: 'asset',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Portão',
    assetKind: 'symbol',
    version: '1.0.0',
    contentHash: 'sha256:dfa291d2f19dbf5cc30bf7c42468aa7d3dc625080118947dfcf9a35ba6ba862a',
    source: '/assets/murim/gate.svg',
    tags: ['portão', 'fronteira', 'passagem', 'murim'],
    dimensions: { width: 64, height: 64 },
    anchor: { x: 32, y: 32 },
    defaultSize: { width: 42, height: 42 },
  },
  {
    id: ASSET_IDS.sect,
    type: 'asset',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Seita / Templo',
    assetKind: 'symbol',
    version: '1.0.0',
    contentHash: 'sha256:8b1883eab3dca389c09d3f948c2e1345528cd9624fbd933520af1404e5d1af1a',
    source: '/assets/murim/sect.svg',
    tags: ['seita', 'templo', 'facção', 'murim'],
    dimensions: { width: 64, height: 64 },
    anchor: { x: 32, y: 32 },
    defaultSize: { width: 42, height: 42 },
  },
  {
    id: ASSET_IDS.qi,
    type: 'asset',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Fonte de Qi',
    assetKind: 'symbol',
    version: '1.0.0',
    contentHash: 'sha256:e20f898dc9f71faf93c72575548865e4dab7356769c73f623305c380bebdbe93',
    source: '/assets/murim/qi.svg',
    tags: ['qi', 'cultivo', 'energia', 'espiritual'],
    dimensions: { width: 64, height: 64 },
    anchor: { x: 32, y: 32 },
    defaultSize: { width: 42, height: 42 },
  },
  {
    id: ASSET_IDS.ruin,
    type: 'asset',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Ruína',
    assetKind: 'symbol',
    version: '1.0.0',
    contentHash: 'sha256:5896dd9a4a67ab61507b247502aedf76b99d075939878ec85fa6675f55d34fbd',
    source: '/assets/murim/ruin.svg',
    tags: ['ruína', 'dungeon', 'antigo', 'perigo'],
    dimensions: { width: 64, height: 64 },
    anchor: { x: 32, y: 32 },
    defaultSize: { width: 42, height: 42 },
  },
];

export const BUILT_IN_ASSET_MANIFESTS: readonly AssetManifest[] = BUILT_IN_ASSET_ENTITIES.map(
  (entity) => ({
    schemaVersion: 1,
    assetId: entity.id,
    name: entity.name,
    version: entity.version,
    contentHash: entity.contentHash,
    kind: 'symbol',
    mediaType: 'image/svg+xml',
    source: entity.source,
    tags: [...entity.tags],
    ...(entity.dimensions ? { dimensions: { ...entity.dimensions } } : {}),
    ...(entity.anchor ? { anchor: { ...entity.anchor } } : {}),
    ...(entity.defaultSize ? { defaultSize: { ...entity.defaultSize } } : {}),
    attribution: 'Murim Map Studio',
    license: 'internal',
  }),
);

export const BUILT_IN_TEMPLATES: readonly TemplateEntity[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    type: 'template',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Vila',
    entityType: 'location',
    defaults: {
      name: 'Nova Vila',
      locationKind: 'village',
      position: { x: 0, y: 0 },
      assetId: ASSET_IDS.village,
      tags: ['social', 'settlement'],
    },
    tags: ['vila', 'social', 'assentamento'],
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    type: 'template',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Portão',
    entityType: 'location',
    defaults: {
      name: 'Novo Portão',
      locationKind: 'gate',
      position: { x: 0, y: 0 },
      assetId: ASSET_IDS.gate,
      tags: ['passage', 'boundary'],
    },
    tags: ['portão', 'fronteira', 'passagem'],
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    type: 'template',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Seita / Templo',
    entityType: 'location',
    defaults: {
      name: 'Nova Seita',
      locationKind: 'sect',
      position: { x: 0, y: 0 },
      assetId: ASSET_IDS.sect,
      tags: ['sect', 'social'],
    },
    tags: ['seita', 'templo', 'facção'],
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    type: 'template',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Fonte de Qi',
    entityType: 'location',
    defaults: {
      name: 'Fonte de Qi',
      locationKind: 'qi-source',
      position: { x: 0, y: 0 },
      assetId: ASSET_IDS.qi,
      tags: ['qi', 'cultivation'],
    },
    tags: ['qi', 'cultivo', 'espiritual'],
  },
  {
    id: '20000000-0000-4000-8000-000000000005',
    type: 'template',
    schemaVersion: 1,
    createdAt: BUILT_IN_CREATED_AT,
    updatedAt: BUILT_IN_CREATED_AT,
    name: 'Ruína',
    entityType: 'location',
    defaults: {
      name: 'Ruína sem nome',
      locationKind: 'ruin',
      position: { x: 0, y: 0 },
      assetId: ASSET_IDS.ruin,
      tags: ['ruin', 'danger'],
    },
    tags: ['ruína', 'dungeon', 'perigo'],
  },
];

export function ensureBuiltInAssetEntities(document: WorldDocument): WorldDocument {
  const existingIds = new Set(document.entities.map((entity) => entity.id));
  const missingAssets = BUILT_IN_ASSET_ENTITIES.filter((asset) => !existingIds.has(asset.id));
  if (missingAssets.length === 0) return document;
  return {
    ...document,
    entities: [...document.entities, ...missingAssets.map((asset) => structuredClone(asset))],
  };
}

export function migrateLegacyStudioWorldId(document: WorldDocument): WorldDocument {
  if (document.rootWorldId !== LEGACY_STUDIO_WORLD_ID) return document;
  return {
    ...document,
    rootWorldId: STUDIO_WORLD_ID,
    entities: document.entities.map((entity) => {
      if (entity.type === 'world' && entity.id === LEGACY_STUDIO_WORLD_ID) {
        return { ...entity, id: STUDIO_WORLD_ID };
      }
      if ('worldId' in entity && entity.worldId === LEGACY_STUDIO_WORLD_ID) {
        return { ...entity, worldId: STUDIO_WORLD_ID };
      }
      return entity;
    }),
  };
}

export function prepareStudioDocument(document: WorldDocument): WorldDocument {
  return ensureBuiltInAssetEntities(migrateLegacyStudioWorldId(document));
}

export function assetManifestForId(assetId?: string): AssetManifest | undefined {
  if (!assetId) return undefined;
  return BUILT_IN_ASSET_MANIFESTS.find((manifest) => manifest.assetId === assetId);
}

export function searchStudioAssets(query: string): AssetManifest[] {
  return searchAssetManifests(BUILT_IN_ASSET_MANIFESTS, query);
}

export interface StudioAssetImportInput {
  fileName: string;
  mediaType: string;
  size: number;
  content: string;
}

export function prepareStudioAssetImport(input: StudioAssetImportInput) {
  if (!['image/svg+xml', 'image/webp', 'image/png'].includes(input.mediaType)) {
    return {
      ok: false as const,
      code: 'unsupported-media-type' as const,
      message: 'Use SVG, WebP ou PNG.',
    };
  }

  if (input.size > MAX_IMPORTED_ASSET_BYTES) {
    return {
      ok: false as const,
      code: 'file-too-large' as const,
      message: 'O asset deve ter no máximo 2 MiB.',
    };
  }

  return undefined;
}
