# Player Auth + Projection Boundary 8B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invite-only email OTP authentication to `apps/player` and expose an authenticated server-only `GET /api/map-projection` that returns only the current player's validated `MapProjection`.

**Architecture:** Supabase Auth provides identity, but the application consumes a provider-neutral `PlayerSession`. Next.js 16 Server Actions, Route Handlers, and Proxy use `@supabase/ssr` with request cookies; server authorization uses `auth.getClaims()`, never `getSession()`. The projection endpoint reads only `player_api` through the authenticated SSR client, parses rows fail-closed, builds the 8A `MapProjection`, revalidates it, runs the anti-leak guard, and returns `private, no-store` JSON.

**Tech Stack:** Next.js 16.3.3, React 19.2.7, TypeScript 6.0.2 strict, Vitest 4.1.11, Supabase CLI 2.115.0, `@supabase/ssr`, `@supabase/supabase-js`, PostgreSQL/RLS/PostgREST.

**Spec:** `docs/superpowers/specs/2026-08-30-player-auth-projection-boundary-design.md`

## Global Constraints

- Supabase Auth only; V0 login is invite-only email OTP, no password.
- `signInWithOtp` MUST set `options.shouldCreateUser = false`.
- OTP length is exactly 6 digits; local expiry is 600 seconds; minimum resend interval is 60 seconds.
- Local player app URL is `http://127.0.0.1:3001`.
- Server authorization MUST use `supabase.auth.getClaims()`; `getSession()` is forbidden as an authorization decision.
- `PlayerSession` is provider-neutral and contains only `sessionVersion: 1` and `playerId`.
- V0 maps `playerId = validated JWT sub` only inside the Supabase adapter.
- Browser code MUST NOT receive `service_role`, auth tokens, canonical IDs, `world_private`, or Supabase authorization logic.
- `GET /api/map-projection` accepts no identity input from query, path, body, or headers controlled by the app.
- Projection reads use authenticated SSR Supabase + existing RLS + explicit `owner_user_id = session.playerId` filtering.
- Projection responses MUST pass runtime row parsing, `buildPlayerMapProjection`, `MapProjectionSchema.parse`, and the recursive anti-leak guard before serialization.
- Authenticated projection responses use `Cache-Control: private, no-store`.
- Keep renderer/UI polish, notes, sharing, exploration runtime, SMTP production setup, and Playwright multi-browser outside 8B.
- CI authority remains `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, database rebuild, pgTAP/RLS, PostgREST smoke, and generated-type drift.

---

### Task 1: Pin Supabase SSR dependencies and local invite-only OTP configuration

**Files:**

- Modify: `apps/player/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `supabase/config.toml`
- Create: `supabase/templates/magic-link.html`
- Create: `apps/player/lib/auth/auth-config.test.ts`

**Interfaces:**

- Consumes: existing Supabase local project and `apps/player` Next.js app.
- Produces: reproducible SSR Auth dependencies and local Auth configuration used by Tasks 2–4.

- [ ] **Step 1: Write the failing configuration test**

Create `apps/player/lib/auth/auth-config.test.ts` that reads `supabase/config.toml` and asserts the exact V0 policy:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('supabase/config.toml', 'utf8');
const template = readFileSync('supabase/templates/magic-link.html', 'utf8');

describe('player auth local configuration', () => {
  it('is invite-only six-digit OTP with finite expiry', () => {
    expect(config).toContain('site_url = "http://127.0.0.1:3001"');
    expect(config).toContain('enable_signup = false');
    expect(config).toContain('otp_length = 6');
    expect(config).toContain('otp_expiry = 600');
    expect(template).toContain('{{ .Token }}');
    expect(template).not.toContain('{{ .ConfirmationURL }}');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm vitest run apps/player/lib/auth/auth-config.test.ts
```

Expected: FAIL because the current config still allows signup and the OTP template does not exist.

- [ ] **Step 3: Configure local Auth exactly**

Update `supabase/config.toml` with:

```toml
[auth]
enabled = true
site_url = "http://127.0.0.1:3001"
additional_redirect_urls = ["http://127.0.0.1:3001"]
jwt_expiry = 3600
enable_signup = false

[auth.email]
enable_signup = false
otp_length = 6
otp_expiry = 600

[auth.rate_limit]
email_sent = 60
```

If the pinned Supabase CLI rejects `auth.rate_limit.email_sent` because the supported local config key differs, inspect `supabase config --help`/current generated config and use the pinned CLI-supported key that enforces one email request per 60 seconds; update the test to assert that exact supported field rather than removing the requirement.

Create `supabase/templates/magic-link.html`:

```html
<h2>Seu código de acesso</h2>
<p>Use este código para entrar no Murim Map Studio:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Este código expira em 10 minutos.</p>
```

Wire the local template path using the pinned CLI-supported `auth.email.template.magic_link` config stanza.

- [ ] **Step 4: Add server-safe environment names only**

Replace `.env.example` with placeholders only:

```dotenv
# Never commit real values.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not add secret/service-role variables to the player app.

- [ ] **Step 5: Add SSR packages with exact lockfile update**

Run through the repo's pinned pnpm:

```bash
pnpm --filter @murim/player add --save-exact @supabase/ssr @supabase/supabase-js
pnpm install --lockfile-only
```

Keep the exact versions chosen by pnpm in `apps/player/package.json` and the canonical lockfile. Do not hand-edit package resolution blocks.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
pnpm vitest run apps/player/lib/auth/auth-config.test.ts
pnpm install --frozen-lockfile
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/player/package.json pnpm-lock.yaml .env.example supabase/config.toml supabase/templates/magic-link.html apps/player/lib/auth/auth-config.test.ts
git commit -m "feat: configure invite-only player OTP auth"
```

---

### Task 2: Create request-scoped Supabase SSR client and session-refresh Proxy

**Files:**

- Create: `apps/player/lib/supabase/env.ts`
- Create: `apps/player/lib/supabase/server.ts`
- Create: `apps/player/lib/supabase/proxy.ts`
- Create: `apps/player/proxy.ts`
- Create: `apps/player/lib/supabase/proxy.test.ts`

**Interfaces:**

- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Next.js cookies/request APIs.
- Produces: `createPlayerSupabaseServerClient()` and `updatePlayerSession(request)`.

- [ ] **Step 1: Write RED tests for env validation and proxy identity verification**

Create tests around pure seams rather than mocking Next internals globally. `env.ts` must export:

```ts
export interface PlayerSupabaseEnv {
  url: string;
  publishableKey: string;
}

export function readPlayerSupabaseEnv(env: NodeJS.ProcessEnv): PlayerSupabaseEnv;
```

Test that blank/missing variables throw and valid values are returned unchanged.

For `proxy.ts`, inject a client factory seam and assert the proxy calls `auth.getClaims()` before returning a response.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm vitest run apps/player/lib/supabase
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement strict env reader**

`apps/player/lib/supabase/env.ts`:

```ts
export interface PlayerSupabaseEnv {
  url: string;
  publishableKey: string;
}

export function readPlayerSupabaseEnv(env: NodeJS.ProcessEnv): PlayerSupabaseEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error('Player Supabase environment is not configured');
  }
  return { url, publishableKey };
}
```

- [ ] **Step 4: Implement request-scoped server client**

Use `createServerClient` from `@supabase/ssr` and `cookies()` from `next/headers`. Export:

```ts
export async function createPlayerSupabaseServerClient(): Promise<SupabaseClient>;
```

Create a new client per request. `setAll` writes cookies when allowed and tolerates Server Component write restrictions only because `proxy.ts` owns session refresh.

- [ ] **Step 5: Implement Proxy using current Supabase SSR guidance**

`apps/player/lib/supabase/proxy.ts` exports:

```ts
export async function updatePlayerSession(request: NextRequest): Promise<NextResponse>;
```

Rules:

- create `NextResponse.next({ request })`;
- build a request-scoped server client from request cookies;
- propagate all `setAll` cookies and cache headers to the same response;
- call `await supabase.auth.getClaims()` immediately after client creation;
- do not use `getSession()`.

`apps/player/proxy.ts` delegates to it and excludes static/image asset paths with a matcher.

- [ ] **Step 6: Verify GREEN**

```bash
pnpm vitest run apps/player/lib/supabase
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/player/lib/supabase apps/player/proxy.ts
git commit -m "feat: add player Supabase SSR session boundary"
```

---

### Task 3: Add provider-neutral `PlayerSession` and Supabase claims adapter

**Files:**

- Create: `apps/player/lib/auth/player-session.ts`
- Create: `apps/player/lib/auth/supabase-player-session.ts`
- Create: `apps/player/lib/auth/player-session.test.ts`

**Interfaces:**

- Consumes: a minimal auth client with `auth.getClaims()`.
- Produces:

```ts
export interface PlayerSession {
  sessionVersion: 1;
  playerId: string;
}

export interface PlayerSessionResolver {
  resolve(): Promise<PlayerSession | null>;
}

export function createSupabasePlayerSessionResolver(client: ClaimsClient): PlayerSessionResolver;
```

- [ ] **Step 1: Write failing resolver tests**

Cover four behaviors:

```ts
it('returns only the validated JWT sub');
it('returns null when claims are absent');
it('returns null when getClaims reports an error');
it('returns null when sub is not a UUID');
```

The successful expected value is exactly:

```ts
{
  sessionVersion: 1,
  playerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
}
```

Assert the result has no `email`, token, role, metadata, or raw claims property.

- [ ] **Step 2: Run RED**

```bash
pnpm vitest run apps/player/lib/auth/player-session.test.ts
```

Expected: FAIL because resolver does not exist.

- [ ] **Step 3: Implement minimal provider-neutral contract**

Keep UUID validation local and explicit; do not add a new dependency only for one regex. `supabase-player-session.ts` may know `getClaims`; `player-session.ts` may not import Supabase.

- [ ] **Step 4: Run GREEN**

```bash
pnpm vitest run apps/player/lib/auth/player-session.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/player/lib/auth/player-session.ts apps/player/lib/auth/supabase-player-session.ts apps/player/lib/auth/player-session.test.ts
git commit -m "feat: add provider-neutral player session"
```

---

### Task 4: Implement invite-only email OTP request, verification, login UI, and logout

**Files:**

- Create: `apps/player/lib/auth/otp.ts`
- Create: `apps/player/lib/auth/otp.test.ts`
- Create: `apps/player/app/login/actions.ts`
- Create: `apps/player/app/login/page.tsx`
- Create: `apps/player/app/auth/signout/route.ts`
- Modify: `apps/player/app/globals.css`
- Modify: `apps/player/app/page.tsx`

**Interfaces:**

- Consumes: `createPlayerSupabaseServerClient()`.
- Produces:

```ts
export function normalizeLoginEmail(value: FormDataEntryValue | null): string | null;
export function parseEmailOtp(value: FormDataEntryValue | null): string | null;
export async function requestOtp(...): Promise<LoginActionState>;
export async function verifyOtp(...): Promise<LoginActionState>;
```

- [ ] **Step 1: Write RED tests for input/security behavior**

`otp.test.ts` must prove:

- e-mail is trimmed/lowercased and invalid formats return `null`;
- OTP accepts only `/^\d{6}$/`;
- request adapter always receives `{ shouldCreateUser: false }`;
- public action result is generic for unknown/known e-mail errors that would reveal account existence;
- malformed OTP is rejected before `verifyOtp` is called.

- [ ] **Step 2: Run RED**

```bash
pnpm vitest run apps/player/lib/auth/otp.test.ts
```

Expected: FAIL because helpers/actions do not exist.

- [ ] **Step 3: Implement pure OTP helpers first**

Use a compact state shape:

```ts
export type LoginActionState =
  | { status: 'idle' }
  | { status: 'code-sent'; email: string; message: string }
  | { status: 'error'; email?: string; message: string };
```

No raw Supabase error object crosses the action boundary.

- [ ] **Step 4: Implement Server Actions**

`requestOtp` calls:

```ts
await supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false },
});
```

For a syntactically valid email, return generic copy equivalent to: `Se o endereço estiver autorizado, o código foi enviado.` Do not distinguish unknown user from delivery failure in public copy.

`verifyOtp` calls:

```ts
await supabase.auth.verifyOtp({ email, token, type: 'email' });
```

On success, `redirect('/')` after `revalidatePath('/', 'layout')`.

- [ ] **Step 5: Implement login page without browser Supabase client**

The page submits only to Server Actions. It has:

- e-mail step;
- six-digit `inputMode="numeric"` code step after `code-sent`;
- resend action routed through the same request action;
- generic errors;
- no signup button;
- no password field.

Keep styling minimal and consistent with foundation UI; do not start final visual direction here.

- [ ] **Step 6: Implement authenticated home redirect and logout POST**

`apps/player/app/page.tsx` resolves `PlayerSession` server-side. If absent, redirect to `/login`; if present, render a foundation status view that can later consume the map renderer.

`POST /auth/signout` validates claims, calls `signOut()`, revalidates the layout, and redirects to `/login`.

- [ ] **Step 7: Verify GREEN**

```bash
pnpm vitest run apps/player/lib/auth
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/player/lib/auth apps/player/app/login apps/player/app/auth/signout apps/player/app/page.tsx apps/player/app/globals.css
git commit -m "feat: add invite-only player OTP flow"
```

---

### Task 5: Build fail-closed player projection source and authenticated endpoint

**Files:**

- Modify: `apps/player/package.json`
- Create: `apps/player/lib/map/player-projection-source.ts`
- Create: `apps/player/lib/map/player-projection-source.test.ts`
- Create: `apps/player/app/api/map-projection/route.ts`
- Create: `apps/player/app/api/map-projection/route.test.ts`

**Interfaces:**

- Consumes: `PlayerSession`, authenticated SSR Supabase client, `buildPlayerMapProjection` and strict projection schema/guard from `@murim/map-renderer`.
- Produces:

```ts
export interface PlayerProjectionSource {
  load(playerId: string): Promise<MapProjection>;
}

export function createSupabasePlayerProjectionSource(
  client: PlayerApiClient,
): PlayerProjectionSource;
```

and `GET /api/map-projection`.

- [ ] **Step 1: Add map-renderer workspace dependency to player app**

Use:

```bash
pnpm --filter @murim/player add --save-exact @murim/map-renderer@workspace:*
```

If pnpm normalizes the workspace spec without an exact flag, retain the canonical workspace protocol generated by pnpm and never copy map-renderer source into the app.

- [ ] **Step 2: Write RED tests for row parsing**

Use fixtures matching `player_api.map_nodes`/`map_routes`. Prove:

- known node parses only with `approximate_radius = null`;
- ghost node requires positive radius;
- Point geometry must be finite x/y;
- LineString path must have at least two finite points;
- unknown/malformed geometry fails closed;
- source queries both tables with `.eq('owner_user_id', playerId)`;
- result is produced through `buildPlayerMapProjection` and strict schema validation.

- [ ] **Step 3: Run RED**

```bash
pnpm vitest run apps/player/lib/map/player-projection-source.test.ts
```

Expected: FAIL because source/parser do not exist.

- [ ] **Step 4: Implement runtime parsers without `any`**

Keep generated PostGIS columns as `unknown` at the adapter boundary. Write explicit type guards for:

```ts
type GeoJsonPoint = { type: 'Point'; coordinates: [number, number] };
type GeoJsonLineString = { type: 'LineString'; coordinates: [number, number][] };
```

Reject non-finite numbers and extra structural assumptions that cannot be validated.

- [ ] **Step 5: Implement source query**

Query only:

```ts
client.schema('player_api').from('map_nodes')...
client.schema('player_api').from('map_routes')...
```

Both queries include `.eq('owner_user_id', playerId)`. Convert database rows to 8A input types and call `buildPlayerMapProjection({ mapKey: 'player-map', generatedAt: new Date().toISOString(), nodes, routes })`.

Before returning, validate with the strict `MapProjectionSchema` and execute the recursive forbidden-key guard exported by map-renderer. If the guard is not currently exported under a stable name, export it from `packages/map-renderer/src/index.ts`; do not duplicate it in `apps/player`.

- [ ] **Step 6: Write RED route-handler tests**

Extract a testable handler factory:

```ts
export function createMapProjectionGetHandler(deps: {
  resolveSession: () => Promise<PlayerSession | null>;
  loadProjection: (playerId: string) => Promise<MapProjection>;
}): () => Promise<Response>;
```

Prove:

- null session -> `401`;
- successful session -> `200` + JSON projection;
- `Cache-Control` exactly contains `private, no-store`;
- handler API has no playerId argument and ignores request query identity entirely;
- source failure returns sanitized `502`/`500` without raw row payload.

- [ ] **Step 7: Implement real route composition**

`apps/player/app/api/map-projection/route.ts` composes request-scoped Supabase client, session resolver, and source. It exports `GET` from the pure factory. It must not import `world_private` types, service keys, or accept identity parameters.

- [ ] **Step 8: Verify GREEN**

```bash
pnpm vitest run apps/player/lib/map apps/player/app/api/map-projection/route.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/player/package.json pnpm-lock.yaml apps/player/lib/map apps/player/app/api/map-projection packages/map-renderer/src/index.ts
git commit -m "feat: add authenticated player projection endpoint"
```

---

### Task 6: Prove invite-only Auth and A/B authorization against local Supabase

**Files:**

- Modify: `scripts/database-api-leakage-test.mjs`
- Create: `scripts/player-auth-projection-test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `supabase/seed.sql` only if deterministic `auth.users` fixtures are necessary for the Auth API test; prefer Auth Admin creation inside the smoke script so application seed remains world-focused.

**Interfaces:**

- Consumes: local Supabase status env, Auth API, existing deterministic A/B player IDs, `player_api` RLS.
- Produces: reproducible integration proof that actual authenticated identities cannot cross projections.

- [ ] **Step 1: Write the integration smoke before wiring CI**

`player-auth-projection-test.mjs` must:

1. read `API_URL`, publishable/anon key, and local service/secret credential from `supabase status -o env` only inside CI/local test process;
2. create or upsert two Auth users with exact IDs matching existing `PLAYER_A` and `PLAYER_B` fixtures, using admin APIs only inside the test script;
3. authenticate or mint sessions through the local Auth server, not by passing an arbitrary owner ID to application code;
4. call the player-facing PostgREST surface for A and B and preserve existing A/B anti-leak assertions;
5. prove anonymous access is denied;
6. prove A cannot request B by adding `owner_user_id=eq.<PLAYER_B>`;
7. prove `world_private` remains unreachable.

Never print access/refresh tokens.

- [ ] **Step 2: Run the smoke and verify RED at the first missing Auth/config behavior**

```bash
pnpm db:start
pnpm db:reset
node scripts/player-auth-projection-test.mjs
pnpm db:stop
```

Expected before all Task 1–5 work is complete: FAIL for a specific missing Auth/session boundary, not because Docker/Supabase failed to start.

- [ ] **Step 3: Make only evidence-based fixes**

If local Auth config naming differs from the spec under CLI 2.115.0, fix `supabase/config.toml` to the pinned CLI-supported field while preserving invite-only/6-digit/600-second behavior. Do not weaken signup restrictions to make tests easier.

- [ ] **Step 4: Wire CI integration test**

Add after the existing PostgREST leakage smoke:

```yaml
- name: Player Auth projection smoke
  run: node scripts/player-auth-projection-test.mjs
```

Keep workflow `permissions: contents: read`.

- [ ] **Step 5: Run full database job locally/CI-equivalent**

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
pnpm db:types > /tmp/database.types.ts
pnpm db:stop
```

Expected: all security assertions pass. If no schema migration was added, generated database types must remain byte-equivalent after formatting.

- [ ] **Step 6: Commit**

```bash
git add scripts/player-auth-projection-test.mjs scripts/database-api-leakage-test.mjs .github/workflows/ci.yml supabase/config.toml supabase/seed.sql
git commit -m "test: prove authenticated player projection isolation"
```

---

### Task 7: Final verification, checkpoint, and 8B PR evidence

**Files:**

- Create: `docs/PLAYER_AUTH_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`
- Modify: PR #10 body after evidence exists.

**Interfaces:**

- Consumes: completed Tasks 1–6.
- Produces: auditable Gate 8B checkpoint; no product behavior change.

- [ ] **Step 1: Run the complete permanent quality suite**

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS.

- [ ] **Step 2: Run full reproducible database/security suite**

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
pnpm db:stop
```

Expected: all PASS.

- [ ] **Step 3: Verify absence of forbidden browser/server shortcuts**

Search:

```bash
rg "getSession\(" apps/player
rg "service_role|SUPABASE_SERVICE|SUPABASE_SECRET" apps/player
rg "world_private" apps/player
rg "createBrowserClient" apps/player
```

Expected:

- no server authorization call to `getSession()`;
- no service/secret key in player app;
- no `world_private` read in player app;
- no browser Supabase client in 8B.

- [ ] **Step 4: Write checkpoint with exact evidence**

`docs/PLAYER_AUTH_V0_STATUS.md` records:

- final head SHA;
- CI push and PR run IDs;
- exact passing `quality`/`database` jobs;
- OTP/invite-only config;
- A/B auth isolation proof;
- endpoint response/cache guarantees;
- explicit remaining Fase 8 work: renderer SVG/React, route knowledge degrees, node details, notes, sharing, mobile.

- [ ] **Step 5: Trigger and wait for permanent CI on the final human-authored head**

Do not count a bot-only lockfile commit without a subsequent permanent CI trigger as final evidence. The same final head must have `quality = success` and `database = success`.

- [ ] **Step 6: Update PR #10 only after CI evidence exists**

Keep PR draft and unmerged. Replace `SPEC-ONLY` status with technical closure evidence and the final head/run IDs.

- [ ] **Step 7: Commit documentation checkpoint**

```bash
git add docs/PLAYER_AUTH_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: record player auth 8B checkpoint"
```

Then require one final permanent CI pass for that documentation head before declaring 8B technically closed.
