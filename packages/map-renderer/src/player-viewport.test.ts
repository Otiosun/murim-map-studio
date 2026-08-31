import { describe, expect, it } from 'vitest';
import type { MapProjection } from './projection';
import { calculatePlayerSvgViewport, hasRenderablePlayerMapGeometry } from './player-viewport';

const baseProjection = (items: MapProjection['items']): MapProjection => ({
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T00:00:00.000Z',
  items,
});

describe('calculatePlayerSvgViewport', () => {
  it('includes negative/fractional node coordinates and every route point', () => {
    const projection = baseProjection([
      {
        id: 'node:a',
        kind: 'node',
        metadata: {},
        role: 'known',
        symbolKey: 'node:known',
        position: { x: -10.5, y: 4.25 },
      },
      {
        id: 'node:b',
        kind: 'node',
        metadata: {},
        role: 'known',
        symbolKey: 'node:known',
        position: { x: 25.75, y: 40.5 },
      },
      {
        id: 'route:r',
        kind: 'route',
        metadata: {},
        fromItemId: 'node:a',
        toItemId: 'node:b',
        styleKey: 'route:confirmed',
        path: {
          kind: 'polyline',
          points: [
            { x: -30.25, y: 1.5 },
            { x: 50.5, y: 60.75 },
          ],
        },
      },
    ]);

    expect(calculatePlayerSvgViewport(projection, 0)).toEqual({
      minX: -30.25,
      minY: 1.5,
      width: 80.75,
      height: 59.25,
      viewBox: '-30.25 1.5 80.75 59.25',
    });
  });

  it('expands ghost bounds by authorized uncertainty radius', () => {
    const projection = baseProjection([
      {
        id: 'node:g',
        kind: 'node',
        metadata: {},
        role: 'ghost',
        symbolKey: 'node:ghost',
        position: { x: 12, y: 20 },
        approximateLocation: { center: { x: 12, y: 20 }, radius: 5 },
      },
    ]);

    expect(calculatePlayerSvgViewport(projection, 0)).toEqual({
      minX: 7,
      minY: 15,
      width: 10,
      height: 10,
      viewBox: '7 15 10 10',
    });
  });

  it('returns a finite deterministic fallback for no renderable geometry', () => {
    const projection = baseProjection([]);

    expect(hasRenderablePlayerMapGeometry(projection)).toBe(false);
    expect(calculatePlayerSvgViewport(projection)).toEqual({
      minX: -50,
      minY: -50,
      width: 100,
      height: 100,
      viewBox: '-50 -50 100 100',
    });
  });

  it('expands a single point to finite non-zero dimensions', () => {
    const projection = baseProjection([
      {
        id: 'node:a',
        kind: 'node',
        metadata: {},
        role: 'known',
        symbolKey: 'node:known',
        position: { x: 2, y: 3 },
      },
    ]);

    const viewport = calculatePlayerSvgViewport(projection, 0);

    expect(viewport.width).toBe(1);
    expect(viewport.height).toBe(1);
    expect(Number.isFinite(viewport.minX)).toBe(true);
    expect(Number.isFinite(viewport.minY)).toBe(true);
  });

  it('rejects negative or non-finite padding', () => {
    const projection = baseProjection([
      {
        id: 'node:a',
        kind: 'node',
        metadata: {},
        role: 'known',
        symbolKey: 'node:known',
        position: { x: 2, y: 3 },
      },
    ]);

    expect(() => calculatePlayerSvgViewport(projection, -1)).toThrow(
      new RangeError('Invalid viewport padding'),
    );
    expect(() => calculatePlayerSvgViewport(projection, Number.NaN)).toThrow(
      new RangeError('Invalid viewport padding'),
    );
  });

  it('does not mutate the projection', () => {
    const projection = baseProjection([
      {
        id: 'node:a',
        kind: 'node',
        metadata: {},
        role: 'known',
        symbolKey: 'node:known',
        position: { x: 2, y: 3 },
      },
    ]);
    const before = structuredClone(projection);

    calculatePlayerSvgViewport(projection);

    expect(projection).toEqual(before);
  });
});
