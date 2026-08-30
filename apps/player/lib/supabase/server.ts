import { createServerClient, type CookieMethodsServer, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { readPlayerSupabaseEnv, type PlayerSupabaseEnvSource } from './env';

interface PlayerServerCookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options: CookieOptions): unknown;
}

interface PlayerServerClientFactoryDependencies<TClient> {
  env: PlayerSupabaseEnvSource;
  getCookieStore(): Promise<PlayerServerCookieStore>;
  createClient(url: string, publishableKey: string, options: { cookies: CookieMethodsServer }): TClient;
}

export function createPlayerSupabaseServerClientFactory<TClient>(
  dependencies: PlayerServerClientFactoryDependencies<TClient>,
) {
  return async function createRequestScopedClient(): Promise<TClient> {
    const env = readPlayerSupabaseEnv(dependencies.env);
    const cookieStore = await dependencies.getCookieStore();

    return dependencies.createClient(env.url, env.publishableKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. The root Proxy owns session refresh.
          }
        },
      },
    });
  };
}

export async function createPlayerSupabaseServerClient(): Promise<SupabaseClient> {
  const createRequestScopedClient = createPlayerSupabaseServerClientFactory({
    env: process.env,
    getCookieStore: async () => {
      const cookieStore = await cookies();
      return {
        getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
        set: (name: string, value: string, options: CookieOptions) =>
          cookieStore.set({ name, value, ...options }),
      };
    },
    createClient: (url, publishableKey, options) =>
      createServerClient(url, publishableKey, options),
  });

  return createRequestScopedClient();
}
