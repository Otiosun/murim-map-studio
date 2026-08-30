import type { MapProjection } from '@murim/map-renderer';
import { describe, expect, it, vi } from 'vitest';
import { createMapProjectionGetHandler } from './route-handler';

const playerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const projection: MapProjection = {
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T20:50:00.000Z',
  items: [],
};

function authenticatedSession() {
  return {
    sessionVersion: 1 as const,
    playerId,
  };
}

describe('createMapProjectionGetHandler', () => {
  it('returns 401 with private no-store cache policy when session is absent', async () => {
    const loadProjection = vi.fn(async (_resolvedPlayerId: string) => projection);
    const handler = createMapProjectionGetHandler({
      resolveSession: async () => null,
      loadProjection,
    });

    const response = await handler();

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(loadProjection).not.toHaveBeenCalled();
  });

  it('returns the authenticated player projection as JSON', async () => {
    const loadProjection = vi.fn(async (_resolvedPlayerId: string) => projection);
    const handler = createMapProjectionGetHandler({
      resolveSession: async () => authenticatedSession(),
      loadProjection,
    });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(projection);
    expect(loadProjection).toHaveBeenCalledExactlyOnceWith(playerId);
  });

  it('has no identity argument and ignores request query identity', async () => {
    const loadProjection = vi.fn(async (_resolvedPlayerId: string) => projection);
    const handler = createMapProjectionGetHandler({
      resolveSession: async () => authenticatedSession(),
      loadProjection,
    });

    expect(handler.length).toBe(0);
    await Reflect.apply(handler, undefined, [
      new Request(
        'http://player.local/api/map-projection?playerId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      ),
    ]);

    expect(loadProjection).toHaveBeenCalledExactlyOnceWith(playerId);
  });

  it('sanitizes projection-source failures without echoing raw data', async () => {
    const rawPayload = 'secret-row-payload';
    const handler = createMapProjectionGetHandler({
      resolveSession: async () => authenticatedSession(),
      loadProjection: async () => {
        throw new Error(rawPayload);
      },
    });

    const response = await handler();
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body).not.toContain(rawPayload);
  });
});
