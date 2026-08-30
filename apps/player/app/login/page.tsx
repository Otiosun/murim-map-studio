import { redirect } from 'next/navigation';
import { createSupabasePlayerSessionResolver } from '../../lib/auth/supabase-player-session';
import { createPlayerSupabaseServerClient } from '../../lib/supabase/server';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const supabase = await createPlayerSupabaseServerClient();
  const session = await createSupabasePlayerSessionResolver(supabase).resolve();

  if (session) {
    redirect('/');
  }

  return (
    <main className="foundation-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">ACESSO DO JOGADOR</p>
        <h1 id="login-title">Entrar no mapa</h1>
        <p className="login-note">
          Use o e-mail autorizado pelo narrador. O acesso é feito por código e não cria novas
          contas.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
