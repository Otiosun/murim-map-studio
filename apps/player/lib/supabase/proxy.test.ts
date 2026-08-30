import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { createPlayerSessionUpdater } from './proxy';

describe('createPlayerSessionUpdater', () => {
  it('validates claims and forwards refreshed cookies and cache headers', async () => {
    const getClaims = vi.fn(async () => ({ data: { claims: { sub: 'player-a' } }, error: null }));
    const createClient = vi.fn((cookieStore) => {
      cookieStore.setAll(
        [
          {
            name: 'sb-session',
            value: 'renewed-session',
            options: { path: '/', httpOnly: true },
          },
        ],
        { 'Cache-Control': 'private, no-store' },
      );
      return { auth: { getClaims } };
    });
    const request = new NextRequest('http://127.0.0.1:3001/');

    const updatePlayerSession = createPlayerSessionUpdater(createClient);
    const response = await updatePlayerSession(request);

    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(response.cookies.get('sb-session')?.value).toBe('renewed-session');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
