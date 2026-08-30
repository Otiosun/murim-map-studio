import type { NextRequest } from 'next/server';
import { updatePlayerSession } from './lib/supabase/proxy';

export function proxy(request: NextRequest) {
  return updatePlayerSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
