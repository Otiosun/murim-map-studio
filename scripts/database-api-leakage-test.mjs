import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PLAYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PLAYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const CANONICAL_VILLAGE_ID = '20000000-0000-4000-8000-000000000001';
const CANONICAL_SECRET_ID = '20000000-0000-4000-8000-000000000002';
const CANONICAL_ROUTE_ID = '30000000-0000-4000-8000-000000000001';
const PLAYER_A_SECRET_PROJECTION_ID = '91000000-0000-4000-8000-000000000002';
const PLAYER_B_SECRET_PROJECTION_ID = '92000000-0000-4000-8000-000000000002';
const PLAYER_A_ROUTE_PROJECTION_ID = '93000000-0000-4000-8000-000000000001';
const PLAYER_B_ROUTE_PROJECTION_ID = '94000000-0000-4000-8000-000000000001';
const SECRET_NAME = 'Mosteiro Sob as Raízes';

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

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function mintAuthenticatedJwt(secret, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      aud: 'authenticated',
      exp: now + 3600,
      iat: now,
      role: 'authenticated',
      sub: subject,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function request(apiUrl, anonKey, jwt, profile, path) {
  return fetch(`${apiUrl}/rest/v1/${path}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Profile': profile,
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
}

async function rpcRequest(apiUrl, anonKey, jwt, profile, functionName, body) {
  return fetch(`${apiUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Profile': profile,
      'Content-Profile': profile,
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response, context) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}`);
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

const env = parseEnv(
  execFileSync('pnpm', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
  }),
);

assert(env.API_URL, 'Supabase status did not expose API_URL');
assert(env.ANON_KEY, 'Supabase status did not expose ANON_KEY');
assert(env.JWT_SECRET, 'Supabase status did not expose JWT_SECRET');

const playerAJwt = mintAuthenticatedJwt(env.JWT_SECRET, PLAYER_A);
const playerBJwt = mintAuthenticatedJwt(env.JWT_SECRET, PLAYER_B);

const playerAResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'player_api',
  'map_nodes?select=*&order=projection_id.asc',
);
const playerARows = await readJson(playerAResponse, 'player A map projection');
assert(playerARows.length === 2, `player A expected 2 rows, received ${playerARows.length}`);

const playerASecret = playerARows.find(
  (row) => row.projection_id === PLAYER_A_SECRET_PROJECTION_ID,
);
assert(playerASecret, 'player A did not receive the expected rumor projection');
assert(playerASecret.role === 'ghost', 'player A rumor projection is not marked as a ghost');
assert(
  Number.isFinite(playerASecret.approximate_radius) && playerASecret.approximate_radius > 0,
  'player A ghost projection has no positive uncertainty radius',
);

const playerAJson = JSON.stringify(playerARows);
assert(!playerAJson.includes(SECRET_NAME), 'player A received the canonical secret location name');
assert(
  !playerAJson.includes(CANONICAL_SECRET_ID),
  'player A received the canonical secret location ID',
);
assert(!playerAJson.includes(CANONICAL_VILLAGE_ID), 'player A received a canonical location ID');
assert(
  !playerAJson.includes(PLAYER_B_SECRET_PROJECTION_ID),
  'player A received player B projection-local ID',
);
assert(
  !('secret_payload' in playerARows[0]),
  'player projection unexpectedly exposes secret_payload',
);
assert(
  !('source_location_id' in playerARows[0]),
  'player projection unexpectedly exposes source_location_id',
);

const playerARouteResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
);
const playerARoutes = await readJson(playerARouteResponse, 'player A route projection');
assert(playerARoutes.length === 1, `player A expected 1 route, received ${playerARoutes.length}`);
const playerARoute = playerARoutes[0];
assert(
  playerARoute.projection_id === PLAYER_A_ROUTE_PROJECTION_ID,
  'player A received an unexpected route projection id',
);
assert(playerARoute.knowledge_state === 'indication', 'player A route state is not indication');
assertLineString(
  playerARoute,
  [
    [100, 120],
    [820, 860],
  ],
  'player A safe route',
);
assert(
  playerARoute.label === null,
  'player A route unexpectedly exposes a canonical-derived label',
);
assert(
  JSON.stringify(playerARoute.details) === '{}',
  'player A route details are not the empty safe object',
);
const playerARouteJson = JSON.stringify(playerARoutes);
assert(!playerARouteJson.includes(CANONICAL_ROUTE_ID), 'player A received the canonical route ID');
assert(
  !playerARouteJson.includes(PLAYER_B_ROUTE_PROJECTION_ID),
  'player A received player B route projection ID',
);
assert(!playerARouteJson.includes('[1400,100]'), 'player A received the canonical route midpoint');
assert(!('source_route_id' in playerARoute), 'player route unexpectedly exposes source_route_id');
assert(!('secret_payload' in playerARoute), 'player route unexpectedly exposes secret_payload');

const forbiddenColumnResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'player_api',
  'map_nodes?select=secret_payload',
);
assert(
  !forbiddenColumnResponse.ok,
  'player_api unexpectedly allows selecting a secret_payload column',
);

const forbiddenRouteColumnResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'player_api',
  'map_routes?select=source_route_id',
);
assert(
  !forbiddenRouteColumnResponse.ok,
  'player_api unexpectedly allows selecting source_route_id from routes',
);

const privateSchemaResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'world_private',
  'locations?select=id,name,geom,secret_payload&limit=1',
);
assert(!privateSchemaResponse.ok, 'world_private is unexpectedly exposed through PostgREST');

const forbiddenServerMutation = await rpcRequest(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'server_api',
  'commit_location_state_v1',
  {},
);
assert(
  !forbiddenServerMutation.ok,
  'authenticated player unexpectedly reached the trusted server mutation API',
);

const forbiddenRouteRefresh = await rpcRequest(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'server_api',
  'refresh_player_route_projection_v1',
  {
    p_owner_user_id: PLAYER_A,
    p_source_route_id: CANONICAL_ROUTE_ID,
  },
);
assert(
  !forbiddenRouteRefresh.ok,
  'authenticated player unexpectedly reached the route materialization API',
);

const playerBResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerBJwt,
  'player_api',
  'map_nodes?select=*&order=projection_id.asc',
);
const playerBRows = await readJson(playerBResponse, 'player B map projection');
assert(playerBRows.length === 2, `player B expected 2 rows, received ${playerBRows.length}`);

const playerBSecret = playerBRows.find(
  (row) => row.projection_id === PLAYER_B_SECRET_PROJECTION_ID,
);
assert(
  playerBSecret?.label === SECRET_NAME,
  'authorized player B did not receive the investigated secret projection',
);
assert(playerBSecret.role === 'known', 'player B investigated projection is not marked as known');
assert(
  playerBSecret.approximate_radius == null,
  'player B known projection unexpectedly retains an uncertainty radius',
);

const playerBJson = JSON.stringify(playerBRows);
assert(playerAJson !== playerBJson, 'player A and player B unexpectedly received identical maps');
assert(
  playerBJson.includes(SECRET_NAME),
  'player B map does not contain the authorized secret name',
);
assert(
  !playerBJson.includes(PLAYER_A_SECRET_PROJECTION_ID),
  'player B received player A projection-local ID',
);

const playerBRouteResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerBJwt,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
);
const playerBRoutes = await readJson(playerBRouteResponse, 'player B route projection');
assert(playerBRoutes.length === 1, `player B expected 1 route, received ${playerBRoutes.length}`);
const playerBRoute = playerBRoutes[0];
assert(
  playerBRoute.projection_id === PLAYER_B_ROUTE_PROJECTION_ID,
  'player B received an unexpected route projection id',
);
assert(playerBRoute.knowledge_state === 'investigated', 'player B route state is not investigated');
assertLineString(
  playerBRoute,
  [
    [100, 120],
    [1400, 100],
    [900, 900],
  ],
  'player B exact route',
);
assert(
  !JSON.stringify(playerBRoutes).includes(PLAYER_A_ROUTE_PROJECTION_ID),
  'player B received player A route projection ID',
);

console.log(
  'PostgREST leakage smoke passed: player A receives safe route topology while player B receives authorized exact route geometry.',
);
