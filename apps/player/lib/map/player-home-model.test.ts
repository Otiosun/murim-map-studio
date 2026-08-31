import type { MapProjection } from '@murim/map-renderer';
import { describe, expect, it, vi } from 'vitest';
import { loadPlayerHomeMap } from './player-home-model';
import type { PlayerProjectionSource } from './player-projection-source';

const projection = (items: MapProjection['items']): MapProjection => ({
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T00:00:00.000Z',
  items,
});

describe('loadPlayerHomeMap', () => {
  it('loads projection with exactly the resolved session player id', async () => {
    const value = projection([
      {
        id: 'node:a',
        kind: 'node',
        metadata: {},
        role: 'known',
        symbolKey: 'node:known',
        position: { x: 1, y: 2 },
      },
    ]);
    const load = vi.fn().mockResolvedValue(value);
    const source: PlayerProjectionSource = { load };

    await expect(loadPlayerHomeMap(source, 'player-session-id')).resolves.toEqual({
      status: 'ready',
      projection: value,
    });
    expect(load).toHaveBeenCalledWith('player-session-id');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a valid empty projection', async () => {
    const value = projection([]);
    const source: PlayerProjectionSource = { load: vi.fn().mockResolvedValue(value) };

    await expect(loadPlayerHomeMap(source, 'player-a')).resolves.toEqual({
      status: 'empty',
      projection: value,
    });
  });

  it('sanitizes projection source failures', async () => {
    const source: PlayerProjectionSource = {
      load: vi.fn().mockRejectedValue(new Error('database secret details')),
    };

    await expect(loadPlayerHomeMap(source, 'player-a')).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
