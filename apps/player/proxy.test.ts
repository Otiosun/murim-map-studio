import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { updatePlayerSession } from './lib/supabase/proxy';

vi.mock('./lib/supabase/proxy', () => ({
  updatePlayerSession: vi.fn(async () => new Response(null, { status: 204 })),
}));

import { config, proxy } from './proxy';

describe('player root proxy', () => {
  it('delegates requests to the session updater', async () => {
    const request = new NextRequest('http://127.0.0.1:3001/map');

    await proxy(request);

    expect(vi.mocked(updatePlayerSession)).toHaveBeenCalledWith(request);
  });

  it('excludes Next static/image assets and common metadata files', () => {
    expect(config.matcher).toEqual([
      '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ]);
  });
});
