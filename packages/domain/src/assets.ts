import type { AssetEntity, EntityId } from './entities';
import type { WorldPoint } from './geometry';

export const ASSET_KINDS = ['symbol', 'illustration', 'texture'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_MEDIA_TYPES = ['image/svg+xml', 'image/webp', 'image/png'] as const;
export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];

export interface AssetManifest {
  schemaVersion: 1;
  assetId: EntityId;
  name: string;
  version: string;
  contentHash: string;
  kind: AssetKind;
  mediaType: AssetMediaType;
  source: string;
  tags: string[];
  dimensions?: { width: number; height: number };
  anchor?: WorldPoint;
  defaultSize?: { width: number; height: number };
  attribution?: string;
  license?: string;
}

export interface AssetManifestMetadata {
  attribution?: string;
  license?: string;
}

function normalizeSearchToken(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

export function searchAssetManifests(
  manifests: readonly AssetManifest[],
  query: string,
): AssetManifest[] {
  const tokens = normalizeSearchToken(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...manifests];

  return manifests.filter((manifest) => {
    const haystack = normalizeSearchToken(
      [manifest.name, manifest.kind, manifest.mediaType, ...manifest.tags].join(' '),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}

export function assetEntityToManifest(
  entity: AssetEntity,
  mediaType: AssetMediaType,
  kind: AssetKind,
  metadata: AssetManifestMetadata = {},
): AssetManifest {
  return {
    schemaVersion: 1,
    assetId: entity.id,
    name: entity.name,
    version: entity.version,
    contentHash: entity.contentHash,
    kind,
    mediaType,
    source: entity.source,
    tags: [...entity.tags],
    ...(entity.dimensions ? { dimensions: { ...entity.dimensions } } : {}),
    ...(entity.anchor ? { anchor: { ...entity.anchor } } : {}),
    ...(entity.defaultSize ? { defaultSize: { ...entity.defaultSize } } : {}),
    ...(metadata.attribution ? { attribution: metadata.attribution } : {}),
    ...(metadata.license ? { license: metadata.license } : {}),
  };
}
