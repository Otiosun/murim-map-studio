import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StudioLibraryPanel } from './studio-library-panel';

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
});
