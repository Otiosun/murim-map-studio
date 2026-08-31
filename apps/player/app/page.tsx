import { redirect } from 'next/navigation';
import { createSupabasePlayerSessionResolver } from '../lib/auth/supabase-player-session';
import { loadPlayerHomeMap } from '../lib/map/player-home-model';
import { createSupabasePlayerProjectionSource } from '../lib/map/player-projection-source';
import { createPlayerSupabaseServerClient } from '../lib/supabase/server';
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

  return (
    <main className="foundation-shell">
      <section className="player-map-card">
        <p className="eyebrow">FOUNDATION V0</p>
        <h1>Mapa do Jogador</h1>
        <div className="player-map-frame">
          {mapState.status === 'unavailable' ? (
            <div
              className="player-map-unavailable"
              data-player-map-state="unavailable"
              role="status"
            >
              O mapa não está disponível no momento.
            </div>
          ) : (
            <PlayerMapSvg projection={mapState.projection} />
          )}
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="button-secondary">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
