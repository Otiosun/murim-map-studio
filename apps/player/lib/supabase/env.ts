export interface PlayerSupabaseEnv {
  url: string;
  publishableKey: string;
}

export type PlayerSupabaseEnvSource = Readonly<Record<string, string | undefined>>;

export function readPlayerSupabaseEnv(env: PlayerSupabaseEnvSource): PlayerSupabaseEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error('Player Supabase environment is not configured');
  }

  return { url, publishableKey };
}
