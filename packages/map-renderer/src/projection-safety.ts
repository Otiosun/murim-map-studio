const FORBIDDEN_PLAYER_PROJECTION_KEYS = new Set([
  'canonicalId',
  'canonical_id',
  'canonicalRouteId',
  'canonical_route_id',
  'sourceLocationId',
  'source_location_id',
  'sourceRouteId',
  'source_route_id',
  'fromLocationId',
  'from_location_id',
  'toLocationId',
  'to_location_id',
  'ownerUserId',
  'owner_user_id',
  'worldId',
  'world_id',
  'secretPayload',
  'secret_payload',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'email',
]);

export function assertPlayerProjectionSafe(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertPlayerProjectionSafe(item);
    }
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PLAYER_PROJECTION_KEYS.has(key)) {
      throw new Error(`Forbidden player projection key: ${key}`);
    }
    assertPlayerProjectionSafe(nestedValue);
  }
}
