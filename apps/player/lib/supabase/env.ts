export interface PlayerSupabaseEnv {
  url: string;
  publishableKey: string;
}

export function readPlayerSupabaseEnv(env: NodeJS.ProcessEnv): PlayerSupabaseEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error('Player Supabase environment is not configured');
  }

  return { url, publishableKey };
}
