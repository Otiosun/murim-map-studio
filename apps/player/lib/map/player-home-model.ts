import { hasRenderablePlayerMapGeometry, type MapProjection } from '@murim/map-renderer';
import type { PlayerProjectionSource } from './player-projection-source';

export type PlayerHomeMapState =
  | { status: 'ready'; projection: MapProjection }
  | { status: 'empty'; projection: MapProjection }
  | { status: 'unavailable' };

export async function loadPlayerHomeMap(
  source: PlayerProjectionSource,
  playerId: string,
): Promise<PlayerHomeMapState> {
  try {
    const projection = await source.load(playerId);

    return hasRenderablePlayerMapGeometry(projection)
      ? { status: 'ready', projection }
      : { status: 'empty', projection };
  } catch {
    return { status: 'unavailable' };
  }
}
