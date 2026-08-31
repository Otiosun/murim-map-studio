import type { MapProjection, ProjectionRoute } from '@murim/map-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerMapSvg } from './player-map-svg';

const routeStates: NonNullable<ProjectionRoute['knowledgeState']>[] = [
  'rumor',
  'indication',
  'localized',
  'confirmed',
  'investigated',
  'understood',
];

const routes: ProjectionRoute[] = routeStates.map((knowledgeState, index) => ({
  id: `route:${knowledgeState}`,
  kind: 'route',
  metadata: {},
  fromItemId: 'node:known',
  toItemId: 'node:ghost',
  styleKey: `route:${knowledgeState}`,
  knowledgeState,
  path: {
    kind: 'polyline',
    points:
      knowledgeState === 'investigated'
        ? [
            { x: 10, y: 20 },
            { x: 25, y: 5 },
            { x: 40, y: 50 },
          ]
        : [
            { x: 10, y: 20 + index },
            { x: 40, y: 50 + index },
          ],
  },
}));

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
    ...routes,
  ],
};

describe('PlayerMapSvg', () => {
  it('renders an accessible interactive map group instead of one opaque image', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Mapa de conhecimento do jogador"');
    expect(html).toContain('role="group"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain('data-node-role="known"');
    expect(html).toContain('data-node-role="ghost"');
    expect(html).toContain('data-uncertainty="true"');
    expect(html).toContain('Vila');
  });

  it('exposes only projection-local node ids as focusable button metadata', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    expect(html).toContain('data-player-node="true"');
    expect(html).toContain('data-node-id="node:known"');
    expect(html).toContain('data-node-id="node:ghost"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-node-selected="false"');
    expect(html).toContain('aria-controls="player-node-detail-panel"');
    expect(html).toContain('aria-label="Vila"');
    expect(html).toContain('aria-label="Local não identificado, localização aproximada"');
  });

  it('renders canonical presentation-only hit targets and visible markers for every node', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);
    const legacyTargetMatches = html.match(/data-node-interaction-target="true"/g) ?? [];
    const targetMatches = html.match(/data-node-hit-target="true"/g) ?? [];
    const markerMatches = html.match(/data-node-marker="true"/g) ?? [];

    expect(legacyTargetMatches).toHaveLength(2);
    expect(targetMatches).toHaveLength(2);
    expect(markerMatches).toHaveLength(2);
    expect(html).toContain('class="player-node-hit-target"');
  });

  it('exposes all six route knowledge states as presentation metadata', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    for (const state of routeStates) {
      expect(html).toContain(`data-route-knowledge-state="${state}"`);
    }
  });

  it('renders the supplied route path exactly instead of reconstructing geometry', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    expect(html).toContain('points="10,20 25,5 40,50"');
  });

  it('does not invent a visible label or expose a projection id for an unlabeled ghost', () => {
    const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);

    expect(html).not.toContain('node:ghost</text>');
    expect(html).not.toContain('>node:ghost<');
  });

  it('renders a semantic empty state instead of an empty svg', () => {
    const empty: MapProjection = { ...projection, items: [] };
    const html = renderToStaticMarkup(<PlayerMapSvg projection={empty} />);

    expect(html).toContain('data-player-map-state="empty"');
    expect(html).not.toContain('<svg');
  });
});
