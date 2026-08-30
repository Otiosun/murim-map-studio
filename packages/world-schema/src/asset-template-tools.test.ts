import { searchAssetManifests, type AssetManifest, type TemplateEntity } from '@murim/domain';
import { describe, expect, it } from 'vitest';
import {
  MAX_ASSET_UPLOAD_BYTES,
  instantiateTemplateEntity,
  parseAssetManifest,
  validateAssetUploadCandidate,
} from './asset-template-tools';

const NOW = '2026-08-30T00:50:00Z';
const WORLD_ID = '00000000-0000-4000-8000-000000000001';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000010';
const LOCATION_ID = '00000000-0000-4000-8000-000000000011';

const villageTemplate: TemplateEntity = {
  id: TEMPLATE_ID,
  type: 'template',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  name: 'Vila Murim',
  entityType: 'location',
  defaults: {
    name: 'Nova Vila',
    locationKind: 'village',
    position: { x: 0, y: 0 },
    tags: ['social', 'settlement'],
  },
  tags: ['village', 'starter'],
};

function manifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    schemaVersion: 1,
    assetId: '00000000-0000-4000-8000-000000000020',
    name: 'Selo de Vila',
    version: '1.0.0',
    contentHash: 'sha256:village',
    kind: 'symbol',
    mediaType: 'image/svg+xml',
    source: '/assets/village.svg',
    tags: ['vila', 'murim', 'mapa'],
    defaultSize: { width: 48, height: 48 },
    license: 'internal',
    ...overrides,
  };
}

describe('Foundation V0 asset and template tools', () => {
  it('parses a strict AssetManifest and searches name/kind/media/tags', () => {
    const village = parseAssetManifest(manifest());
    const qi = parseAssetManifest(
      manifest({
        assetId: '00000000-0000-4000-8000-000000000021',
        name: 'Fonte de Qi',
        contentHash: 'sha256:qi',
        tags: ['qi', 'cultivo'],
      }),
    );

    expect(searchAssetManifests([village, qi], 'vila mapa')).toEqual([village]);
    expect(searchAssetManifests([village, qi], 'qi')).toEqual([qi]);
    expect(searchAssetManifests([village, qi], '')).toHaveLength(2);
  });

  it('validates import type, extension and size and flags SVG sanitization', () => {
    expect(
      validateAssetUploadCandidate({
        fileName: 'sect-seal.svg',
        mediaType: 'image/svg+xml',
        sizeBytes: 24_000,
      }),
    ).toEqual({ ok: true, mediaType: 'image/svg+xml', requiresSvgSanitization: true });

    const mismatch = validateAssetUploadCandidate({
      fileName: 'sect-seal.png',
      mediaType: 'image/svg+xml',
      sizeBytes: 24_000,
    });
    expect(mismatch.ok).toBe(false);

    const tooLarge = validateAssetUploadCandidate({
      fileName: 'art.webp',
      mediaType: 'image/webp',
      sizeBytes: MAX_ASSET_UPLOAD_BYTES + 1,
    });
    expect(tooLarge.ok).toBe(false);
  });

  it('instantiates a template with a fresh identity and placement overrides', () => {
    const entity = instantiateTemplateEntity(villageTemplate, {
      id: LOCATION_ID,
      worldId: WORLD_ID,
      createdAt: NOW,
      overrides: {
        name: 'Vila Qinghe',
        position: { x: 8400, y: 1200 },
      },
    });

    expect(entity).toMatchObject({
      id: LOCATION_ID,
      type: 'location',
      worldId: WORLD_ID,
      createdAt: NOW,
      updatedAt: NOW,
      name: 'Vila Qinghe',
      locationKind: 'village',
      position: { x: 8400, y: 1200 },
    });
    expect(entity.id).not.toBe(villageTemplate.id);
  });

  it('refuses template payloads that attempt to overwrite canonical identity', () => {
    const unsafe: TemplateEntity = {
      ...villageTemplate,
      defaults: {
        ...villageTemplate.defaults,
        id: '00000000-0000-4000-8000-000000000099',
      },
    };

    expect(() =>
      instantiateTemplateEntity(unsafe, {
        id: LOCATION_ID,
        worldId: WORLD_ID,
        createdAt: NOW,
      }),
    ).toThrow(/protected identity keys/i);
  });
});
