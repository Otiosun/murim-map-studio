import { createSupabasePlayerSessionResolver } from '../../../lib/auth/supabase-player-session';
import { createSupabasePlayerProjectionSource } from '../../../lib/map/player-projection-source';
import { createPlayerSupabaseServerClient } from '../../../lib/supabase/server';
import { createMapProjectionGetHandler } from './route-handler';

export async function GET(): Promise<Response> {
  const client = await createPlayerSupabaseServerClient();
  const sessionResolver = createSupabasePlayerSessionResolver(client);
  const projectionSource = createSupabasePlayerProjectionSource(client);

  const handler = createMapProjectionGetHandler({
    resolveSession: () => sessionResolver.resolve(),
    loadProjection: (playerId) => projectionSource.load(playerId),
  });

  return handler();
}
