import { describe, expect, it } from 'vitest';
import * as studioAssets from './studio-assets';

type PrepareImport = (
  input: {
    fileName: string;
    mediaType: string;
    size: number;
    content: string;
  },
  options?: { sanitizeSvg?: (markup: string) => string },
) => unknown;

type PrepareFile = (
  file: File,
  options: {
    sanitizeSvg?: (markup: string) => string;
    readRasterDataUrl?: (file: File) => Promise<string>;
  },
) => Promise<unknown>;

const prepareStudioAssetImport = studioAssets.prepareStudioAssetImport as unknown as PrepareImport;
const prepareStudioAssetFile = (studioAssets as unknown as { prepareStudioAssetFile?: PrepareFile })
  .prepareStudioAssetFile;

describe('studio asset import', () => {
  // SVG previews must be derived from sanitized markup only.
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

  it('rejects SVG when no sanitizer is available', () => {
    const result = prepareStudioAssetImport({
      fileName: 'sect.svg',
      mediaType: 'image/svg+xml',
      size: 96,
      content: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8z" /></svg>',
    });

    expect(result).toEqual({
      ok: false,
      code: 'svg-sanitizer-required',
      message: 'SVG precisa ser sanitizado antes do preview.',
    });
  });

  it('builds SVG preview only from sanitizer output', () => {
    const unsafe =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0h8v8z" /></svg>';
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8z" /></svg>';

    const result = prepareStudioAssetImport(
      {
        fileName: 'sect.svg',
        mediaType: 'image/svg+xml',
        size: 96,
        content: unsafe,
      },
      { sanitizeSvg: () => clean },
    );

    expect(result).toEqual({
      ok: true,
      draft: true,
      fileName: 'sect.svg',
      mediaType: 'image/svg+xml',
      size: 96,
      previewSource: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`,
      sanitized: true,
    });
    expect(JSON.stringify(result)).not.toContain('script');
  });

  it('rejects SVG when sanitization removes all meaningful markup', () => {
    const result = prepareStudioAssetImport(
      {
        fileName: 'unsafe.svg',
        mediaType: 'image/svg+xml',
        size: 64,
        content: '<svg><script>alert(1)</script></svg>',
      },
      { sanitizeSvg: () => '   ' },
    );

    expect(result).toEqual({
      ok: false,
      code: 'unsafe-svg',
      message: 'O SVG não possui conteúdo seguro após sanitização.',
    });
  });

  it('reads an SVG File and prepares only the sanitizer output for preview', async () => {
    expect(typeof prepareStudioAssetFile).toBe('function');
    if (!prepareStudioAssetFile) return;

    const unsafe = '<svg><script>alert(1)</script><path d="M0 0h8v8z" /></svg>';
    const clean = '<svg><path d="M0 0h8v8z" /></svg>';
    const file = new File([unsafe], 'sect.svg', { type: 'image/svg+xml' });

    const result = await prepareStudioAssetFile(file, {
      sanitizeSvg: () => clean,
    });

    expect(result).toEqual({
      ok: true,
      draft: true,
      fileName: 'sect.svg',
      mediaType: 'image/svg+xml',
      size: file.size,
      previewSource: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`,
      sanitized: true,
    });
  });
});
