import type { MapProjection } from '@murim/map-renderer';
import type { PlayerSession } from '../../../lib/auth/player-session';

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
} as const;

export function createMapProjectionGetHandler(dependencies: {
  resolveSession: () => Promise<PlayerSession | null>;
  loadProjection: (playerId: string) => Promise<MapProjection>;
}): () => Promise<Response> {
  return async function getMapProjection() {
    const session = await dependencies.resolveSession();

    if (session === null) {
      return Response.json(
        { error: 'unauthorized' },
        {
          status: 401,
          headers: RESPONSE_HEADERS,
        },
      );
    }

    try {
      const projection = await dependencies.loadProjection(session.playerId);
      return Response.json(projection, {
        status: 200,
        headers: RESPONSE_HEADERS,
      });
    } catch {
      return Response.json(
        { error: 'projection_unavailable' },
        {
          status: 502,
          headers: RESPONSE_HEADERS,
        },
      );
    }
  };
}
