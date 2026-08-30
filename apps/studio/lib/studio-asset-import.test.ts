import { describe, expect, it } from 'vitest';
import * as studioAssets from './studio-assets';

type PrepareImport = (input: {
  fileName: string;
  mediaType: string;
  size: number;
  content: string;
}) => unknown;

const prepareStudioAssetImport = studioAssets.prepareStudioAssetImport as unknown as PrepareImport;

describe('studio asset import', () => {
  it('exposes a preparation function before imported assets can enter the Studio', () => {
    expect('prepareStudioAssetImport' in studioAssets).toBe(true);
  });

  it('rejects media types outside SVG, WebP and PNG', () => {
    const result = prepareStudioAssetImport({
      fileName: 'portrait.gif',
      mediaType: 'image/gif',
      size: 128,
      content: 'GIF89a',
    });

    expect(result).toEqual({
      ok: false,
      code: 'unsupported-media-type',
      message: 'Use SVG, WebP ou PNG.',
    });
  });

  it('rejects an asset larger than 2 MiB', () => {
    const result = prepareStudioAssetImport({
      fileName: 'huge-map-symbol.png',
      mediaType: 'image/png',
      size: 2 * 1024 * 1024 + 1,
      content: 'data:image/png;base64,AA==',
    });

    expect(result).toEqual({
      ok: false,
      code: 'file-too-large',
      message: 'O asset deve ter no máximo 2 MiB.',
    });
  });

  it('prepares a supported raster asset as an uncommitted preview draft', () => {
    const result = prepareStudioAssetImport({
      fileName: 'village.png',
      mediaType: 'image/png',
      size: 128,
      content: 'data:image/png;base64,AA==',
    });

    expect(result).toEqual({
      ok: true,
      draft: true,
      fileName: 'village.png',
      mediaType: 'image/png',
      size: 128,
      previewSource: 'data:image/png;base64,AA==',
      sanitized: false,
    });
  });
});
