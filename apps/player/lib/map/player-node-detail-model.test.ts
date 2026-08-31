import type { MapProjection } from '@murim/map-renderer';
import { describe, expect, it } from 'vitest';
import {
  buildPlayerNodeDetailViews,
  formatPlayerKnowledgeState,
  getPlayerNodeAccessibleName,
  getPlayerNodeDisplayName,
} from './player-node-detail-model';

const projection: MapProjection = {
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-31T18:00:00.000Z',
  items: [
    {
      id: 'node:known',
      kind: 'node',
      metadata: { presentationOnly: true },
      role: 'known',
      symbolKey: 'location:settlement',
      label: 'Vila Qinghe',
      position: { x: 100, y: 120 },
      knowledgeState: 'confirmed',
      confidence: 0.9,
      detail: { category: 'Vila', summary: 'Ponto conhecido.' },
    },
    {
      id: 'node:ghost',
      kind: 'node',
      metadata: {},
      role: 'ghost',
      symbolKey: 'location:unknown-signal',
      position: { x: 820, y: 860 },
      approximateLocation: { center: { x: 820, y: 860 }, radius: 180 },
      knowledgeState: 'rumor',
    },
    {
      id: 'route:authorized',
      kind: 'route',
      metadata: {},
      fromItemId: 'node:known',
      toItemId: 'node:ghost',
      styleKey: 'route:indication',
      knowledgeState: 'indication',
      path: {
        kind: 'polyline',
        points: [
          { x: 100, y: 120 },
          { x: 820, y: 860 },
        ],
      },
    },
  ],
};

describe('player node detail view model', () => {
  it('derives only geometry-free client-safe node fields', () => {
    const views = buildPlayerNodeDetailViews(projection);

    expect(views).toEqual([
      {
        id: 'node:known',
        label: 'Vila Qinghe',
        role: 'known',
        knowledgeState: 'confirmed',
        detail: { category: 'Vila', summary: 'Ponto conhecido.' },
      },
      {
        id: 'node:ghost',
        role: 'ghost',
        knowledgeState: 'rumor',
      },
    ]);

    const serialized = JSON.stringify(views);
    expect(serialized).not.toContain('position');
    expect(serialized).not.toContain('approximateLocation');
    expect(serialized).not.toContain('confidence');
    expect(serialized).not.toContain('symbolKey');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('route:authorized');
  });

  it('uses only safe presentation copy for missing labels and ghost accessibility', () => {
    expect(getPlayerNodeDisplayName({})).toBe('Local não identificado');
    expect(getPlayerNodeAccessibleName({ role: 'ghost' })).toBe(
      'Local não identificado, localização aproximada',
    );
    expect(getPlayerNodeAccessibleName({ label: 'Vila Qinghe', role: 'known' })).toBe(
      'Vila Qinghe',
    );
  });

  it.each([
    ['rumor', 'Rumor'],
    ['indication', 'Indício'],
    ['localized', 'Localizado'],
    ['confirmed', 'Confirmado'],
    ['investigated', 'Investigado'],
    ['understood', 'Compreendido'],
  ] as const)('formats %s as safe player-facing copy', (state, expected) => {
    expect(formatPlayerKnowledgeState(state)).toBe(expected);
  });
});
