import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PLAYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PLAYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const CANONICAL_VILLAGE_ID = '20000000-0000-4000-8000-000000000001';
const CANONICAL_SECRET_ID = '20000000-0000-4000-8000-000000000002';
const PLAYER_B_SECRET_PROJECTION_ID = '92000000-0000-4000-8000-000000000002';
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

async function readJson(response, context) {
  const text = await response.text();
  assert(response.ok, `${context} failed (${response.status}): ${text}`);
  return JSON.parse(text);
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

const playerAJson = JSON.stringify(playerARows);
assert(!playerAJson.includes(SECRET_NAME), 'player A received the canonical secret location name');
assert(!playerAJson.includes(CANONICAL_SECRET_ID), 'player A received the canonical secret location ID');
assert(!playerAJson.includes(CANONICAL_VILLAGE_ID), 'player A received a canonical location ID');
assert(
  !playerAJson.includes(PLAYER_B_SECRET_PROJECTION_ID),
  'player A received player B projection-local ID',
);
assert(!('secret_payload' in playerARows[0]), 'player projection unexpectedly exposes secret_payload');
assert(!('source_location_id' in playerARows[0]), 'player projection unexpectedly exposes source_location_id');

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

const privateSchemaResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'world_private',
  'locations?select=id,name,geom,secret_payload&limit=1',
);
assert(!privateSchemaResponse.ok, 'world_private is unexpectedly exposed through PostgREST');

const playerBResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerBJwt,
  'player_api',
  'map_nodes?select=*&order=projection_id.asc',
);
const playerBRows = await readJson(playerBResponse, 'player B map projection');
assert(playerBRows.length === 2, `player B expected 2 rows, received ${playerBRows.length}`);
assert(
  playerBRows.some(
    (row) => row.projection_id === PLAYER_B_SECRET_PROJECTION_ID && row.label === SECRET_NAME,
  ),
  'authorized player B did not receive the investigated secret projection',
);

console.log('PostgREST leakage smoke passed: private truth is not recoverable by player A.');
