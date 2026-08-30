import { redirect } from 'next/navigation';
import { createSupabasePlayerSessionResolver } from '../lib/auth/supabase-player-session';
import { createPlayerSupabaseServerClient } from '../lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PlayerHome() {
  const supabase = await createPlayerSupabaseServerClient();
  const session = await createSupabasePlayerSessionResolver(supabase).resolve();

  if (!session) {
    redirect('/login');
  }

  return (
    <main className="foundation-shell">
      <section className="login-card">
        <p className="eyebrow">FOUNDATION V0</p>
        <h1>Mapa do Jogador</h1>
        <p>Sessão autenticada. A projeção individual segura será conectada nesta fronteira.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="button-secondary">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
