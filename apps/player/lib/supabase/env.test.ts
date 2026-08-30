import { describe, expect, it } from 'vitest';
// @ts-expect-error RED: env module is intentionally absent until the Task 2 implementation.
import { readPlayerSupabaseEnv } from './env';

describe('readPlayerSupabaseEnv', () => {
  it('rejects missing or blank configuration', () => {
    expect(() => readPlayerSupabaseEnv({})).toThrow(
      'Player Supabase environment is not configured',
    );
    expect(() =>
      readPlayerSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: '   ',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toThrow('Player Supabase environment is not configured');
  });

  it('returns trimmed valid values', () => {
    expect(
      readPlayerSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: ' https://example.supabase.co ',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test ',
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    });
  });
});
