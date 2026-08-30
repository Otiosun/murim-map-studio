import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { readPlayerSupabaseEnv } from './env';

interface PlayerProxyAuthClient {
  auth: {
    getClaims(): Promise<unknown>;
  };
}

export type PlayerProxyClientFactory = (
  cookies: CookieMethodsServer,
) => PlayerProxyAuthClient;

export function createPlayerSessionUpdater(createClient: PlayerProxyClientFactory) {
  return async function updatePlayerSession(request: NextRequest): Promise<NextResponse> {
    let response = NextResponse.next({ request });
    const client = createClient({
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    });

    await client.auth.getClaims();
    return response;
  };
}

export async function updatePlayerSession(request: NextRequest): Promise<NextResponse> {
  const env = readPlayerSupabaseEnv(process.env);
  const updater = createPlayerSessionUpdater(
    (cookies): SupabaseClient =>
      createServerClient(env.url, env.publishableKey, {
        cookies,
      }),
  );

  return updater(request);
}
