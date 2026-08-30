import type { PlayerSessionResolver } from './player-session';

export interface ClaimsClient {
  auth: {
    getClaims(): Promise<unknown>;
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createSupabasePlayerSessionResolver(client: ClaimsClient): PlayerSessionResolver {
  return {
    async resolve() {
      const result = await client.auth.getClaims();

      if (!isRecord(result) || result.error) {
        return null;
      }

      const data = result.data;
      if (!isRecord(data)) {
        return null;
      }

      const claims = data.claims;
      if (!isRecord(claims)) {
        return null;
      }

      const sub = claims.sub;
      if (typeof sub !== 'string' || !UUID_PATTERN.test(sub)) {
        return null;
      }

      return {
        sessionVersion: 1,
        playerId: sub,
      };
    },
  };
}
