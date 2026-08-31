import { execFileSync } from 'node:child_process';

const PLAYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PLAYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const PLAYER_A_SECRET_PROJECTION_ID = '91000000-0000-4000-8000-000000000002';
const PLAYER_B_SECRET_PROJECTION_ID = '92000000-0000-4000-8000-000000000002';
const PLAYER_A_ROUTE_PROJECTION_ID = '93000000-0000-4000-8000-000000000001';
const PLAYER_B_ROUTE_PROJECTION_ID = '94000000-0000-4000-8000-000000000001';
const SECRET_NAME = 'Mosteiro Sob as Raízes';
const PLAYER_A_EMAIL = 'player-a@murim-map-studio.test';
const PLAYER_B_EMAIL = 'player-b@murim-map-studio.test';
const TEST_PASSWORD = 'Local-8B-Test-Only-2026!';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseEnv(output) {
  return Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        assert(separator > 0, `Unexpected supabase status env line: ${line}`);
        const key = line.slice(0, separator);
        let value = line.slice(separator + 1);
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

async function readJson(response, context) {
  const text = await response.text();
  if (!response.ok) {
    let errorCode = null;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error_code === 'string') {
        errorCode = parsed.error_code;
      }
    } catch {
      // Keep diagnostics deliberately body-free so auth tokens and user data never reach CI logs.
    }
    const suffix = errorCode === null ? '' : ` (${errorCode})`;
    throw new Error(`${context} failed with HTTP ${response.status}${suffix}`);
  }
  return text ? JSON.parse(text) : null;
}

function assertLineString(row, expectedCoordinates, context) {
  assert(row?.geom?.type === 'LineString', `${context} is not a LineString`);
  assert(
    JSON.stringify(row.geom.coordinates) === JSON.stringify(expectedCoordinates),
    `${context} has unexpected coordinates`,
  );
}

function adminHeaders(adminKey) {
  return {
    Accept: 'application/json',
    apikey: adminKey,
    Authorization: `Bearer ${adminKey}`,
    'Content-Type': 'application/json',
  };
}

async function recreateAuthUser(apiUrl, adminKey, user) {
  await fetch(`${apiUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: adminHeaders(adminKey),
  });

  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(adminKey),
    body: JSON.stringify({
      id: user.id,
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { purpose: 'player-auth-projection-smoke' },
    }),
  });
  const created = await readJson(response, `create auth user ${user.id}`);
  assert(created?.id === user.id, `Auth server did not preserve requested id ${user.id}`);
  assert(
    typeof created?.email_confirmed_at === 'string',
    `Auth Admin created ${user.id} without a confirmed email`,
  );
  assert(
    Array.isArray(created?.identities) && created.identities.length > 0,
    `Auth Admin created ${user.id} without an email identity`,
  );
}

async function authenticate(apiUrl, anonKey, user) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      password: TEST_PASSWORD,
    }),
  });
  const session = await readJson(response, `authenticate ${user.id}`);
  assert(typeof session?.access_token === 'string', `Auth server returned no token for ${user.id}`);

  const identityResponse = await fetch(`${apiUrl}/auth/v1/user`, {
    headers: {
      Accept: 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const identity = await readJson(identityResponse, `resolve authenticated identity ${user.id}`);
  assert(identity?.id === user.id, `Authenticated identity does not match ${user.id}`);

  return session.access_token;
}

async function postgrestRequest(apiUrl, anonKey, profile, path, accessToken) {
  const headers = {
    Accept: 'application/json',
    'Accept-Profile': profile,
    apikey: anonKey,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${apiUrl}/rest/v1/${path}`, { headers });
}

async function assertSignupDisabled(apiUrl, anonKey) {
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'blocked-signup@murim-map-studio.test',
      password: TEST_PASSWORD,
    }),
  });

  assert(!response.ok, 'Public Auth signup is unexpectedly enabled');
}

const env = parseEnv(
  execFileSync('pnpm', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
  }),
);

const anonKey = env.ANON_KEY ?? env.PUBLISHABLE_KEY;
const adminKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
assert(env.API_URL, 'Supabase status did not expose API_URL');
assert(anonKey, 'Supabase status did not expose an anonymous/publishable key');
assert(adminKey, 'Supabase status did not expose a service/secret key');

await assertSignupDisabled(env.API_URL, anonKey);

const playerA = { id: PLAYER_A, email: PLAYER_A_EMAIL };
const playerB = { id: PLAYER_B, email: PLAYER_B_EMAIL };
await recreateAuthUser(env.API_URL, adminKey, playerA);
await recreateAuthUser(env.API_URL, adminKey, playerB);

const playerAToken = await authenticate(env.API_URL, anonKey, playerA);
const playerBToken = await authenticate(env.API_URL, anonKey, playerB);

const anonymousResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  'map_nodes?select=projection_id&limit=1',
);
assert(!anonymousResponse.ok, 'Anonymous caller unexpectedly reached player_api');

const playerAResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  'map_nodes?select=*&order=projection_id.asc',
  playerAToken,
);
const playerARows = await readJson(playerAResponse, 'authenticated player A projection');
assert(playerARows.length === 2, `player A expected 2 rows, received ${playerARows.length}`);
assert(
  playerARows.some((row) => row.projection_id === PLAYER_A_SECRET_PROJECTION_ID),
  'player A did not receive its own rumor projection',
);
const playerAJson = JSON.stringify(playerARows);
assert(!playerAJson.includes(SECRET_NAME), 'player A received player B authorized secret name');
assert(
  !playerAJson.includes(PLAYER_B_SECRET_PROJECTION_ID),
  'player A received player B projection-local ID',
);

const forcedPlayerBResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  `map_nodes?select=*&owner_user_id=eq.${PLAYER_B}`,
  playerAToken,
);
const forcedPlayerBRows = await readJson(
  forcedPlayerBResponse,
  'player A forced player B projection query',
);
assert(
  forcedPlayerBRows.length === 0,
  'player A bypassed RLS by explicitly filtering for player B',
);

const playerARouteResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
  playerAToken,
);
const playerARoutes = await readJson(playerARouteResponse, 'authenticated player A routes');
assert(playerARoutes.length === 1, `player A expected 1 route, received ${playerARoutes.length}`);
assert(
  playerARoutes[0].projection_id === PLAYER_A_ROUTE_PROJECTION_ID,
  'player A did not receive its own route projection',
);
assert(playerARoutes[0].knowledge_state === 'indication', 'player A route state is not indication');
assertLineString(
  playerARoutes[0],
  [
    [100, 120],
    [820, 860],
  ],
  'authenticated player A safe route',
);
assert(
  !JSON.stringify(playerARoutes).includes(PLAYER_B_ROUTE_PROJECTION_ID),
  'player A received player B route projection-local ID',
);

const forcedPlayerBRouteResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  `map_routes?select=*&owner_user_id=eq.${PLAYER_B}`,
  playerAToken,
);
const forcedPlayerBRoutes = await readJson(
  forcedPlayerBRouteResponse,
  'player A forced player B route query',
);
assert(forcedPlayerBRoutes.length === 0, 'player A bypassed route RLS by filtering for player B');

const playerBResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  'map_nodes?select=*&order=projection_id.asc',
  playerBToken,
);
const playerBRows = await readJson(playerBResponse, 'authenticated player B projection');
assert(playerBRows.length === 2, `player B expected 2 rows, received ${playerBRows.length}`);
const playerBJson = JSON.stringify(playerBRows);
assert(
  playerBJson.includes(PLAYER_B_SECRET_PROJECTION_ID),
  'player B did not receive its own investigated projection',
);
assert(playerBJson.includes(SECRET_NAME), 'player B did not receive its authorized secret name');
assert(
  !playerBJson.includes(PLAYER_A_SECRET_PROJECTION_ID),
  'player B received player A projection-local ID',
);

const playerBRouteResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
  playerBToken,
);
const playerBRoutes = await readJson(playerBRouteResponse, 'authenticated player B routes');
assert(playerBRoutes.length === 1, `player B expected 1 route, received ${playerBRoutes.length}`);
assert(
  playerBRoutes[0].projection_id === PLAYER_B_ROUTE_PROJECTION_ID,
  'player B did not receive its own investigated route',
);
assert(playerBRoutes[0].knowledge_state === 'investigated', 'player B route is not investigated');
assertLineString(
  playerBRoutes[0],
  [
    [100, 120],
    [1400, 100],
    [900, 900],
  ],
  'authenticated player B exact route',
);
assert(
  !JSON.stringify(playerBRoutes).includes(PLAYER_A_ROUTE_PROJECTION_ID),
  'player B received player A route projection-local ID',
);

const privateSchemaResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'world_private',
  'locations?select=id,name&limit=1',
  playerAToken,
);
assert(!privateSchemaResponse.ok, 'Authenticated player unexpectedly reached world_private');

console.log(
  'Player Auth projection smoke passed: real A/B sessions remain isolated and route geometry precision follows authorized knowledge.',
);