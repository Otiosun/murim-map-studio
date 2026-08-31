import type { MapProjection } from '@murim/map-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerMapSvg } from './player-map-svg';

const projection: MapProjection = {
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T00:00:00.000Z',
  items: [
    {
      id: 'node:known',
      kind: 'node',
      metadata: {},
      role: 'known',
      symbolKey: 'node:known',
      label: 'Vila',
      position: { x: 10, y: 20 },
      knowledgeState: 'confirmed',
    },
    {
      id: 'node:ghost',
      kind: 'node',
      metadata: {},
      role: 'ghost',
      symbolKey: 'node:ghost',
      position: { x: 40, y: 50 },
      approximateLocation: { center: { x: 40, y: 50 }, radius: 8 },
    },
    {
      id: 'route:r',
      kind: 'route',
      metadata: {},
      fromItemId: 'node:known',
      toItemId: 'node:ghost',
      styleKey: 'route:rumor',
      path: {
        kind: 'polyline',
        points: [
          { x: 10, y: 20 },
          { x: 40, y: 50 },
        ],
      },
    },
  ],
};

describe('PlayerMapSvg', () => {
  it('renders accessible SVG, authorized labels, route geometry and distinct known/ghost states', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Mapa de conhecimento do jogador"');
    expect(html).toContain('data-node-role="known"');
    expect(html).toContain('data-node-role="ghost"');
    expect(html).toContain('data-uncertainty="true"');
    expect(html).toContain('points="10,20 40,50"');
    expect(html).toContain('Vila');
  });

  it('does not invent a label for unlabeled projection items', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    expect(html).not.toContain('node:ghost</text>');
  });

  it('renders a semantic empty state instead of an empty svg', () => {
    const empty: MapProjection = { ...projection, items: [] };
    const html = renderToStaticMarkup(<PlayerMapSvg projection={empty} />);

    expect(html).toContain('data-player-map-state="empty"');
    expect(html).not.toContain('<svg');
  });
});
