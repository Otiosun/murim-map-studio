import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error RED: player session modules are intentionally absent until Task 3 implementation.
import { createSupabasePlayerSessionResolver } from './supabase-player-session';

const playerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

function claimsClient(result: unknown) {
  return {
    auth: {
      getClaims: vi.fn(async () => result),
    },
  };
}

describe('createSupabasePlayerSessionResolver', () => {
  it('returns only the validated JWT sub', async () => {
    const client = claimsClient({
      data: {
        claims: {
          sub: playerId,
          email: 'player@example.com',
          role: 'authenticated',
          user_metadata: { secret: 'do-not-forward' },
        },
      },
      error: null,
    });

    const session = await createSupabasePlayerSessionResolver(client).resolve();

    expect(session).toEqual({ sessionVersion: 1, playerId });
    expect(session).not.toHaveProperty('email');
    expect(session).not.toHaveProperty('token');
    expect(session).not.toHaveProperty('role');
    expect(session).not.toHaveProperty('metadata');
    expect(session).not.toHaveProperty('claims');
    expect(client.auth.getClaims).toHaveBeenCalledTimes(1);
  });

  it('returns null when claims are absent', async () => {
    const client = claimsClient({ data: { claims: null }, error: null });

    await expect(createSupabasePlayerSessionResolver(client).resolve()).resolves.toBeNull();
  });

  it('returns null when getClaims reports an error', async () => {
    const client = claimsClient({ data: null, error: new Error('invalid token') });

    await expect(createSupabasePlayerSessionResolver(client).resolve()).resolves.toBeNull();
  });

  it('returns null when sub is not a UUID', async () => {
    const client = claimsClient({ data: { claims: { sub: 'player-a' } }, error: null });

    await expect(createSupabasePlayerSessionResolver(client).resolve()).resolves.toBeNull();
  });
});
