import { describe, expect, it, vi } from 'vitest';
import { createPlayerSupabaseServerClientFactory } from './server';

describe('createPlayerSupabaseServerClientFactory', () => {
  it('creates a request-scoped client with the current cookie store', async () => {
    const cookieStore = {
      getAll: vi.fn(() => [{ name: 'sb-session', value: 'session-a' }]),
      set: vi.fn(),
    };
    const createClient = vi.fn((_url, _key, options) => ({ options }));
    const createServerClient = createPlayerSupabaseServerClientFactory({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: ' https://example.supabase.co ',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test ',
      },
      getCookieStore: async () => cookieStore,
      createClient,
    });

    const client = await createServerClient();
    const cookies = createClient.mock.calls[0]?.[2]?.cookies;

    expect(client).toBeDefined();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_test',
      expect.any(Object),
    );
    expect(cookies.getAll()).toEqual([{ name: 'sb-session', value: 'session-a' }]);

    cookies.setAll([
      { name: 'sb-session', value: 'renewed', options: { path: '/', httpOnly: true } },
    ]);
    expect(cookieStore.set).toHaveBeenCalledWith('sb-session', 'renewed', {
      path: '/',
      httpOnly: true,
    });
  });

  it('tolerates cookie writes rejected by a Server Component cookie store', async () => {
    const cookieStore = {
      getAll: () => [],
      set: vi.fn(() => {
        throw new Error('Cookies can only be modified in a Server Action or Route Handler');
      }),
    };
    const createClient = vi.fn((_url, _key, options) => ({ options }));
    const createServerClient = createPlayerSupabaseServerClientFactory({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      },
      getCookieStore: async () => cookieStore,
      createClient,
    });

    await createServerClient();
    const cookies = createClient.mock.calls[0]?.[2]?.cookies;

    expect(() =>
      cookies.setAll([{ name: 'sb-session', value: 'renewed', options: { path: '/' } }]),
    ).not.toThrow();
  });
});
