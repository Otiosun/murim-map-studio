import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StudioLibraryPanel } from './studio-library-panel';

type ImportPreviewPanelProps = {
  mode: 'assets';
  query: string;
  onQueryChange: (query: string) => void;
  onSelectAsset: () => void;
  onClearAsset: () => void;
  onSelectTemplate: () => void;
  onClose: () => void;
  importDraft: {
    fileName: string;
    mediaType: string;
    size: number;
    previewSource: string;
    sanitized: boolean;
  };
  onCancelImport: () => void;
  onConfirmImport: () => void;
};

const ImportPreviewPanel = StudioLibraryPanel as unknown as ComponentType<ImportPreviewPanelProps>;

describe('StudioLibraryPanel asset import', () => {
  // The browser picker must expose only media types accepted by the import contract.
  it('offers a file input restricted to the canonical visual asset media types', () => {
    const html = renderToStaticMarkup(
      <StudioLibraryPanel
        mode="assets"
        query=""
        onQueryChange={() => undefined}
        onSelectAsset={() => undefined}
        onClearAsset={() => undefined}
        onSelectTemplate={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('Importar asset');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/svg+xml,image/webp,image/png"');
  });

  it('shows an uncommitted import preview with explicit cancel and confirm actions', () => {
    const html = renderToStaticMarkup(
      <ImportPreviewPanel
        mode="assets"
        query=""
        onQueryChange={() => undefined}
        onSelectAsset={() => undefined}
        onClearAsset={() => undefined}
        onSelectTemplate={() => undefined}
        onClose={() => undefined}
        importDraft={{
          fileName: 'qinghe-gate.svg',
          mediaType: 'image/svg+xml',
          size: 1536,
          previewSource: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
          sanitized: true,
        }}
        onCancelImport={() => undefined}
        onConfirmImport={() => undefined}
      />,
    );

    expect(html).toContain('qinghe-gate.svg');
    expect(html).toContain('1.5 KiB');
    expect(html).toContain('Cancelar');
    expect(html).toContain('Confirmar importação');
    expect(html).toContain('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E');
  });
});
