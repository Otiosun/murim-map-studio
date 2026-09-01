import { redirect } from 'next/navigation';
import { createSupabasePlayerSessionResolver } from '../lib/auth/supabase-player-session';
import { loadPlayerHomeMap } from '../lib/map/player-home-model';
import { buildPlayerNodeDetailViews } from '../lib/map/player-node-detail-model';
import { createSupabasePlayerProjectionSource } from '../lib/map/player-projection-source';
import { createPlayerSupabaseServerClient } from '../lib/supabase/server';
import { PlayerMapExplorer } from './player-map-explorer';
import { PlayerMapSvg } from './player-map-svg';

export const dynamic = 'force-dynamic';

export default async function PlayerHome() {
  const supabase = await createPlayerSupabaseServerClient();
  const session = await createSupabasePlayerSessionResolver(supabase).resolve();

  if (!session) {
    redirect('/login');
  }

  const mapState = await loadPlayerHomeMap(
    createSupabasePlayerProjectionSource(supabase),
    session.playerId,
  );

  const mapContent =
    mapState.status === 'unavailable' ? (
      <div className="player-map-unavailable" data-player-map-state="unavailable" role="status">
        O mapa não está disponível no momento.
      </div>
    ) : (
      <PlayerMapExplorer nodes={buildPlayerNodeDetailViews(mapState.projection)}>
        <PlayerMapSvg projection={mapState.projection} />
      </PlayerMapExplorer>
    );

  return (
    <main className="foundation-shell">
      <section className="player-map-card">
        <p className="eyebrow">FOUNDATION V0</p>
        <h1>Mapa do Jogador</h1>
        <div className="player-map-frame">{mapContent}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="button-secondary">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
