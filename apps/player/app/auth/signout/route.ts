import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createSupabasePlayerSessionResolver } from '../../../lib/auth/supabase-player-session';
import { createPlayerSupabaseServerClient } from '../../../lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createPlayerSupabaseServerClient();
  const session = await createSupabasePlayerSessionResolver(supabase).resolve();

  if (session) {
    await supabase.auth.signOut();
  }

  revalidatePath('/', 'layout');
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
