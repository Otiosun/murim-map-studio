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
});
