# Player Route Knowledge V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure player-facing route knowledge degrees so low-knowledge routes expose only player-authorized topological geometry while confirmed+ routes may expose exact geometry only when both endpoint nodes are exact and authorized.

**Architecture:** Keep canonical route truth and per-player route knowledge in `world_private`. A `service_role`-only database routine materializes already-sanitized rows into `player_api.map_routes`; the application projection source remains a strict consumer/validator and the SVG renderer remains presentation-only. Preserve the existing `ProjectionRoute.path` contract and use `knowledgeState` only for visual semantics, never for client-side authorization.

**Tech Stack:** PostgreSQL/PostGIS via Supabase CLI 2.115.0, PostgREST/RLS, pgtap database tests, Node.js 24.20.0, TypeScript 6.0.2, React 19, Next.js 16.3.3, Vitest 4.1.11, pnpm 11.21.0.

**Spec:** `docs/superpowers/specs/2026-08-31-player-route-knowledge-design.md`

## Global Constraints

- Base implementation branch is `foundation/player-route-knowledge-v0`, created from exact green 8C head `68bdd424348822e297ad4803367a16243dddb070`.
- `MapProjection` remains the renderer boundary; do not add canonical route IDs or canonical endpoint IDs to any player-facing TypeScript contract.
- `rumor`, `indication`, and `localized` never expose canonical route geometry.
- `confirmed`, `investigated`, and `understood` may expose canonical geometry only when both player-facing endpoint nodes are `role = 'known'` with non-null authorized geometry.
- Any ghost endpoint forces topological fallback built only from `player_api.map_nodes.geom` values already authorized for that player.
- Missing player-facing endpoint projection suppresses the route entirely.
- `player_api.map_routes` must be safe under direct PostgREST access; security cannot depend on React, CSS, API route composition, or browser behavior.
- `world_private` stays unavailable to `anon` and `authenticated`; the route materialization routine is executable only by `service_role`.
- Player-facing route materialization must not copy canonical `routes.name`, `payload`, `secret_payload`, source IDs, world IDs, or endpoint canonical IDs. Gate 8D V0 emits `label = null` and `details = '{}'::jsonb`; richer authorized route facts remain future scope.
- Existing Gate 8B and 8C permanent checks stay green: RLS, PostgREST leakage smoke, real Auth A/B smoke, generated database types, all unit tests, build, lint, format, and typecheck.
- No pan/zoom, node-detail UI, route editing, pathfinding, traversal simulation, uncertainty corridors, per-segment knowledge, Pixi/WebGPU, merge, or deploy in Gate 8D.

---

## File Structure

### New files

- `supabase/migrations/20260831062000_player_route_knowledge_v0.sql` — private route-knowledge table and service-only route projection materializer.
- `supabase/tests/database/player_route_knowledge.test.sql` — pgtap proof for low/high states, fallback, suppression, privileges, and A/B isolation.
- `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md` — final Gate 8D technical checkpoint after implementation evidence is green.

### Modified files

- `supabase/seed.sql` — adversarial canonical route geometry, player A/B route knowledge fixtures, and materialized public route rows.
- `supabase/database.types.ts` — regenerated schema types after the migration.
- `scripts/database-api-leakage-test.mjs` — direct PostgREST proof that player A cannot retrieve canonical route geometry or B’s route row.
- `scripts/player-auth-projection-test.mjs` — real Auth A/B route-isolation and geometry-precision assertions.
- `packages/map-renderer/src/projection-safety.ts` — forbid route-specific canonical/source key aliases recursively.
- `packages/map-renderer/src/projection-safety.test.ts` — TDD coverage for those route-specific forbidden keys.
- `apps/player/app/player-map-svg.tsx` — expose route knowledge state as presentation metadata only.
- `apps/player/app/player-map-svg.test.tsx` — assert renderer preserves supplied path and exposes each state without reconstructing geometry.
- `apps/player/app/globals.css` — visual hierarchy for the six route knowledge states using existing SVG/currentColor system.
- `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` — append Gate 8D implementation/evidence without falsely closing Gate 8 overall.

No production change is planned for `apps/player/lib/map/player-projection-source.ts` or `packages/map-renderer/src/player-projection.ts`; their current responsibility already matches the approved design. Regression tests must prove that assumption.

---

### Task 1: Database-owned route knowledge and safe materialization

**Files:**

- Create: `supabase/tests/database/player_route_knowledge.test.sql`
- Create: `supabase/migrations/20260831062000_player_route_knowledge_v0.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/database.types.ts`

**Interfaces:**

- Produces private table:
  ```sql
  world_private.player_route_knowledge(
    owner_user_id uuid,
    source_route_id uuid,
    projection_id uuid,
    state world_private.knowledge_state,
    confidence numeric(5,4),
    origin_kind text,
    origin_label text,
    learned_at timestamptz,
    refreshed_at timestamptz
  )
  ```
- Produces service-only routine:
  ```sql
  server_api.refresh_player_route_projection_v1(
    p_owner_user_id uuid,
    p_source_route_id uuid
  ) returns void
  ```
- The routine consumes canonical `world_private.routes`, private route/location knowledge mappings, and already-sanitized `player_api.map_nodes`.
- The routine produces or removes exactly one `player_api.map_routes` row for that owner/source route.
- Public route rows contain only player-local projection IDs, `knowledge_state`, safe `geom`, `label = null`, `details = '{}'::jsonb`, and timestamp.

- [ ] **Step 1: Add failing pgtap coverage before the migration exists**

Create `supabase/tests/database/player_route_knowledge.test.sql` with the security contract expressed directly against the database. Use the seeded player IDs already canonical in the repo:

```sql
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

select has_table(
  'world_private',
  'player_route_knowledge',
  'private per-player route knowledge exists'
);

select ok(
  not has_table_privilege('authenticated', 'world_private.player_route_knowledge', 'SELECT'),
  'authenticated cannot read private route knowledge'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'server_api.refresh_player_route_projection_v1(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute route materialization'
);

select ok(
  has_function_privilege(
    'service_role',
    'server_api.refresh_player_route_projection_v1(uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute route materialization'
);

select hasnt_column(
  'player_api',
  'map_routes',
  'source_route_id',
  'player route surface exposes no canonical source route id'
);

select hasnt_column(
  'player_api',
  'map_routes',
  'from_location_id',
  'player route surface exposes no canonical from-location id'
);

select hasnt_column(
  'player_api',
  'map_routes',
  'to_location_id',
  'player route surface exposes no canonical to-location id'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$select count(*)::bigint from player_api.map_routes$$,
  $$values (1::bigint)$$,
  'player A sees one player-local route row'
);

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('indication'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'player A low-state route is topological from authorized endpoint positions'
);

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_routes
    where extensions.st_dwithin(
      geom,
      extensions.st_setsrid(extensions.st_makepoint(1400, 100), 0),
      0.000001
    )
  $$,
  $$values (0::bigint)$$,
  'player A route does not contain the adversarial canonical midpoint'
);

select results_eq(
  $$select count(*)::bigint from player_api.map_routes where projection_id = '94000000-0000-4000-8000-000000000001'::uuid$$,
  $$values (0::bigint)$$,
  'player A cannot read player B route projection id'
);

reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '94000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('investigated'::text, 'LINESTRING(100 120,1400 100,900 900)'::text)$$,
  'player B investigated route may receive exact canonical geometry with two exact endpoints'
);

reset role;

update world_private.player_route_knowledge
set state = 'confirmed', refreshed_at = '2026-08-31T06:00:00Z'
where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;

select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('confirmed'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'confirmed route with a ghost endpoint still falls back to safe topology'
);

reset role;

delete from player_api.map_nodes
where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  and projection_id = '91000000-0000-4000-8000-000000000002'::uuid;

select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_routes
    where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  $$,
  $$values (0::bigint)$$,
  'missing endpoint projection suppresses the route'
);

select ok(
  not has_schema_privilege('authenticated', 'world_private', 'USAGE'),
  '8D preserves the world_private schema boundary'
);

select ok(
  has_table_privilege('authenticated', 'player_api.map_routes', 'SELECT'),
  'authenticated still reads only the sanitized route surface'
);

select ok(
  not has_table_privilege('authenticated', 'player_api.map_routes', 'INSERT'),
  'authenticated cannot directly insert route projection rows'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the database suite and verify RED**

Run:

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
```

Expected: `player_route_knowledge.test.sql` fails because `world_private.player_route_knowledge` and `server_api.refresh_player_route_projection_v1(uuid,uuid)` do not exist yet. Existing tests must remain green up to that new failure.

- [ ] **Step 3: Add the migration with the minimal private model and materializer**

Create `supabase/migrations/20260831062000_player_route_knowledge_v0.sql` with this shape:

```sql
begin;

create table world_private.player_route_knowledge (
  owner_user_id uuid not null,
  source_route_id uuid not null references world_private.routes(id) on delete cascade,
  projection_id uuid not null,
  state world_private.knowledge_state not null,
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  origin_kind text not null check (btrim(origin_kind) <> ''),
  origin_label text,
  learned_at timestamptz not null,
  refreshed_at timestamptz not null,
  primary key (owner_user_id, source_route_id),
  unique (owner_user_id, projection_id)
);

create index player_route_knowledge_owner_idx
  on world_private.player_route_knowledge (owner_user_id);

revoke all on world_private.player_route_knowledge from public, anon, authenticated;
grant all on world_private.player_route_knowledge to service_role;

create function server_api.refresh_player_route_projection_v1(
  p_owner_user_id uuid,
  p_source_route_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, extensions
as $$
declare
  v_knowledge world_private.player_route_knowledge%rowtype;
  v_route world_private.routes%rowtype;
  v_from_projection_id uuid;
  v_to_projection_id uuid;
  v_from_role text;
  v_to_role text;
  v_from_geom extensions.geometry;
  v_to_geom extensions.geometry;
  v_public_geom extensions.geometry;
  v_exact_allowed boolean;
begin
  select *
    into v_knowledge
    from world_private.player_route_knowledge
   where owner_user_id = p_owner_user_id
     and source_route_id = p_source_route_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'route_knowledge_not_found';
  end if;

  select *
    into v_route
    from world_private.routes
   where id = p_source_route_id;

  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select projection_id
    into v_from_projection_id
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id
     and source_location_id = v_route.from_location_id;

  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select projection_id
    into v_to_projection_id
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id
     and source_location_id = v_route.to_location_id;

  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select role, geom
    into v_from_role, v_from_geom
    from player_api.map_nodes
   where owner_user_id = p_owner_user_id
     and projection_id = v_from_projection_id;

  if not found or v_from_geom is null then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select role, geom
    into v_to_role, v_to_geom
    from player_api.map_nodes
   where owner_user_id = p_owner_user_id
     and projection_id = v_to_projection_id;

  if not found or v_to_geom is null then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  v_exact_allowed :=
    v_knowledge.state in ('confirmed', 'investigated', 'understood')
    and v_from_role = 'known'
    and v_to_role = 'known';

  v_public_geom := case
    when v_exact_allowed then v_route.geom
    else extensions.st_makeline(v_from_geom, v_to_geom)
  end;

  insert into player_api.map_routes (
    owner_user_id,
    projection_id,
    from_projection_id,
    to_projection_id,
    label,
    knowledge_state,
    geom,
    details,
    updated_at
  ) values (
    p_owner_user_id,
    v_knowledge.projection_id,
    v_from_projection_id,
    v_to_projection_id,
    null,
    v_knowledge.state::text,
    v_public_geom,
    '{}'::jsonb,
    v_knowledge.refreshed_at
  )
  on conflict (owner_user_id, projection_id) do update
    set from_projection_id = excluded.from_projection_id,
        to_projection_id = excluded.to_projection_id,
        label = excluded.label,
        knowledge_state = excluded.knowledge_state,
        geom = excluded.geom,
        details = excluded.details,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function server_api.refresh_player_route_projection_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function server_api.refresh_player_route_projection_v1(uuid, uuid)
  to service_role;

commit;
```

Do not derive `label` from `world_private.routes.name` and do not copy route `payload`/`secret_payload` into `details`.

- [ ] **Step 4: Extend the deterministic seed with adversarial route knowledge**

In `supabase/seed.sql`, change the existing canonical route geometry to an unmistakably non-topological line:

```sql
extensions.st_geomfromtext('LINESTRING(100 120, 1400 100, 900 900)', 0)
```

After the existing `player_api.map_nodes` seed insert, add:

```sql
insert into world_private.player_route_knowledge (
  owner_user_id,
  source_route_id,
  projection_id,
  state,
  confidence,
  origin_kind,
  origin_label,
  learned_at,
  refreshed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '30000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    'indication',
    0.45,
    'npc-rumor',
    'mercador desconhecido',
    '2026-08-29T13:30:00Z',
    '2026-08-29T13:30:00Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '30000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'investigated',
    0.95,
    'personal-exploration',
    'investigação própria',
    '2026-08-29T15:00:00Z',
    '2026-08-29T15:00:00Z'
  );

select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);

select server_api.refresh_player_route_projection_v1(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);
```

This creates the security contrast required by the spec: player A gets `LINESTRING(100 120,820 860)` while player B may get `LINESTRING(100 120,1400 100,900 900)`.

- [ ] **Step 5: Rebuild the DB and verify GREEN**

Run:

```bash
pnpm db:reset
pnpm db:test
```

Expected: all previous DB/RLS tests plus `player_route_knowledge.test.sql` pass. No existing assertion count may be silently reduced; update `plan(...)` only where new assertions were intentionally added.

- [ ] **Step 6: Regenerate checked-in database types**

Run exactly the same generation path CI validates:

```bash
pnpm db:types > supabase/database.types.generated.ts
pnpm prettier --write supabase/database.types.generated.ts
cp supabase/database.types.generated.ts supabase/database.types.ts
rm supabase/database.types.generated.ts
```

Then verify the new generated types include `world_private.player_route_knowledge` and `server_api.refresh_player_route_projection_v1`, while `player_api.map_routes` still contains no canonical source columns.

- [ ] **Step 7: Re-run database tests after type regeneration**

```bash
pnpm db:test
```

Expected: PASS.

- [ ] **Step 8: Commit the database substrate**

```bash
git add supabase/migrations/20260831062000_player_route_knowledge_v0.sql \
  supabase/tests/database/player_route_knowledge.test.sql \
  supabase/seed.sql \
  supabase/database.types.ts
git commit -m "feat: add safe player route knowledge materialization"
```

---

### Task 2: Direct PostgREST and real-Auth route leakage proofs

**Files:**

- Modify: `scripts/database-api-leakage-test.mjs`
- Modify: `scripts/player-auth-projection-test.mjs`

**Interfaces:**

- Consumes player-facing rows only through PostgREST profile `player_api`.
- Must never query `world_private` successfully with a player token.
- Player A route projection ID: `93000000-0000-4000-8000-000000000001`.
- Player B route projection ID: `94000000-0000-4000-8000-000000000001`.
- Canonical route ID: `30000000-0000-4000-8000-000000000001`, which must never appear in player JSON.
- Adversarial canonical midpoint: `[1400, 100]`, which must never appear in player A route geometry.

- [ ] **Step 1: Extend the direct PostgREST smoke**

Add route constants and a LineString helper to `scripts/database-api-leakage-test.mjs`:

```js
const CANONICAL_ROUTE_ID = '30000000-0000-4000-8000-000000000001';
const PLAYER_A_ROUTE_PROJECTION_ID = '93000000-0000-4000-8000-000000000001';
const PLAYER_B_ROUTE_PROJECTION_ID = '94000000-0000-4000-8000-000000000001';

function assertLineString(row, expected, context) {
  assert(row?.geom?.type === 'LineString', `${context} is not a LineString`);
  assert(
    JSON.stringify(row.geom.coordinates) === JSON.stringify(expected),
    `${context} coordinates are not the expected authorized geometry`,
  );
}
```

After player A node assertions, query:

```js
const playerARoutesResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
);
const playerARoutes = await readJson(playerARoutesResponse, 'player A route projection');
assert(playerARoutes.length === 1, `player A expected 1 route, received ${playerARoutes.length}`);
const playerARoute = playerARoutes[0];
assert(playerARoute.projection_id === PLAYER_A_ROUTE_PROJECTION_ID, 'player A route id mismatch');
assert(playerARoute.knowledge_state === 'indication', 'player A route state mismatch');
assertLineString(playerARoute, [[100, 120], [820, 860]], 'player A route');
const playerARouteJson = JSON.stringify(playerARoutes);
assert(!playerARouteJson.includes(CANONICAL_ROUTE_ID), 'player A received canonical route id');
assert(!playerARouteJson.includes(PLAYER_B_ROUTE_PROJECTION_ID), 'player A received player B route id');
assert(!playerARouteJson.includes('[1400,100]'), 'player A received canonical route midpoint');
assert(!('source_route_id' in playerARoute), 'player route surface exposes source_route_id');
```

After player B node assertions, query and prove exact authorized geometry:

```js
const playerBRoutesResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerBJwt,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
);
const playerBRoutes = await readJson(playerBRoutesResponse, 'player B route projection');
assert(playerBRoutes.length === 1, `player B expected 1 route, received ${playerBRoutes.length}`);
const playerBRoute = playerBRoutes[0];
assert(playerBRoute.projection_id === PLAYER_B_ROUTE_PROJECTION_ID, 'player B route id mismatch');
assert(playerBRoute.knowledge_state === 'investigated', 'player B route state mismatch');
assertLineString(playerBRoute, [[100, 120], [1400, 100], [900, 900]], 'player B route');
assert(!JSON.stringify(playerBRoutes).includes(PLAYER_A_ROUTE_PROJECTION_ID), 'player B received player A route id');
```

Also attempt forbidden canonical-column selection:

```js
const forbiddenRouteColumnResponse = await request(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'player_api',
  'map_routes?select=source_route_id',
);
assert(!forbiddenRouteColumnResponse.ok, 'player_api unexpectedly exposes source_route_id');
```

- [ ] **Step 2: Run the direct smoke**

```bash
node scripts/database-api-leakage-test.mjs
```

Expected: PASS and no raw secrets/service keys printed.

- [ ] **Step 3: Extend the real Auth A/B smoke with route isolation**

In `scripts/player-auth-projection-test.mjs`, add the same A/B route projection constants and query `map_routes` using the real access tokens produced by Supabase Auth.

For player A assert:

```js
const playerARouteResponse = await postgrestRequest(
  env.API_URL,
  anonKey,
  'player_api',
  'map_routes?select=*&order=projection_id.asc',
  playerAToken,
);
const playerARoutes = await readJson(playerARouteResponse, 'authenticated player A routes');
assert(playerARoutes.length === 1, 'player A did not receive exactly one route');
assert(playerARoutes[0].projection_id === PLAYER_A_ROUTE_PROJECTION_ID, 'player A route id mismatch');
assert(
  JSON.stringify(playerARoutes[0].geom?.coordinates) === JSON.stringify([[100, 120], [820, 860]]),
  'player A received geometry beyond its authorized route precision',
);
```

Attempt an explicit owner filter for B and require zero rows:

```js
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
assert(forcedPlayerBRoutes.length === 0, 'player A bypassed route RLS for player B');
```

For player B assert exact investigated geometry and absence of A’s route projection ID.

- [ ] **Step 4: Run the real Auth smoke**

```bash
node scripts/player-auth-projection-test.mjs
```

Expected: PASS. Keep diagnostics body-free on auth failures exactly as the existing script does.

- [ ] **Step 5: Run the full DB/security sequence**

```bash
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

Expected: all PASS.

- [ ] **Step 6: Commit security acceptance tests**

```bash
git add scripts/database-api-leakage-test.mjs scripts/player-auth-projection-test.mjs
git commit -m "test: prove player route geometry isolation"
```

---

### Task 3: Route-specific anti-leak guard and SVG knowledge presentation

**Files:**

- Modify: `packages/map-renderer/src/projection-safety.test.ts`
- Modify: `packages/map-renderer/src/projection-safety.ts`
- Modify: `apps/player/app/player-map-svg.test.tsx`
- Modify: `apps/player/app/player-map-svg.tsx`
- Modify: `apps/player/app/globals.css`
- Regression-test only: `apps/player/lib/map/player-projection-source.test.ts`
- Regression-test only: `packages/map-renderer/src/player-projection.test.ts`

**Interfaces:**

- `ProjectionRoute.path` stays required and unchanged.
- `ProjectionRoute.knowledgeState` remains the state source.
- `PlayerMapSvg` adds only `data-route-knowledge-state={route.knowledgeState}`; it does not inspect endpoints or reconstruct geometry.
- Existing `data-route-style={route.styleKey}` remains for compatibility.

- [ ] **Step 1: Write a failing anti-leak guard test for route-specific key aliases**

Extend `forbiddenKeys` in `packages/map-renderer/src/projection-safety.test.ts` first:

```ts
const forbiddenKeys = [
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
] as const;
```

- [ ] **Step 2: Run the guard test and verify RED**

```bash
pnpm vitest run packages/map-renderer/src/projection-safety.test.ts
```

Expected: FAIL for at least the new route-specific aliases because `projection-safety.ts` does not forbid them yet.

- [ ] **Step 3: Add the same route-specific aliases to the production guard**

Update `FORBIDDEN_PLAYER_PROJECTION_KEYS` in `packages/map-renderer/src/projection-safety.ts` with exactly the additional eight route/endpoint aliases above.

- [ ] **Step 4: Re-run the guard test**

```bash
pnpm vitest run packages/map-renderer/src/projection-safety.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing SVG state-metadata test**

Extend `apps/player/app/player-map-svg.test.tsx` with route fixtures for all six knowledge states and assert the generated markup contains:

```ts
for (const state of [
  'rumor',
  'indication',
  'localized',
  'confirmed',
  'investigated',
  'understood',
] as const) {
  expect(html).toContain(`data-route-knowledge-state="${state}"`);
}
```

Keep a deliberately bent supplied route path in at least one fixture and assert its exact `points="..."` string is preserved; the component must not replace it with an endpoint-only line.

- [ ] **Step 6: Run the SVG test and verify RED**

```bash
pnpm vitest run apps/player/app/player-map-svg.test.tsx
```

Expected: FAIL because `data-route-knowledge-state` is not emitted yet.

- [ ] **Step 7: Add presentation metadata only**

Change the existing route `<polyline>` in `apps/player/app/player-map-svg.tsx` to:

```tsx
<polyline
  aria-hidden="true"
  data-route-knowledge-state={route.knowledgeState}
  data-route-style={route.styleKey}
  fill="none"
  key={route.id}
  points={route.path.points.map((point) => `${point.x},${point.y}`).join(' ')}
  vectorEffect="non-scaling-stroke"
/>
```

Do not add any geometry logic to this component.

- [ ] **Step 8: Add the six-state visual hierarchy in existing CSS**

Keep the generic route rule, then append:

```css
.player-map-svg [data-route-knowledge-state='rumor'] {
  stroke-dasharray: 1 5;
  opacity: 0.22;
}

.player-map-svg [data-route-knowledge-state='indication'] {
  stroke-dasharray: 3 5;
  opacity: 0.36;
}

.player-map-svg [data-route-knowledge-state='localized'] {
  stroke-dasharray: 6 4;
  opacity: 0.5;
}

.player-map-svg [data-route-knowledge-state='confirmed'] {
  stroke-dasharray: none;
  opacity: 0.65;
}

.player-map-svg [data-route-knowledge-state='investigated'] {
  stroke-dasharray: none;
  stroke-width: 1.5;
  opacity: 0.78;
}

.player-map-svg [data-route-knowledge-state='understood'] {
  stroke-dasharray: none;
  stroke-width: 1.75;
  opacity: 0.9;
}
```

These styles encode epistemic state only. They must not be used to decide whether a supplied route path is exact or topological.

- [ ] **Step 9: Run focused renderer and projection tests**

```bash
pnpm vitest run \
  packages/map-renderer/src/projection-safety.test.ts \
  packages/map-renderer/src/player-projection.test.ts \
  packages/map-renderer/src/player-viewport.test.ts \
  apps/player/lib/map/player-projection-source.test.ts \
  apps/player/app/player-map-svg.test.tsx
```

Expected: PASS. In particular, the existing projection-source test must continue proving that `details` such as `canonicalId` are not copied into `MapProjection`, and the renderer must preserve the authorized route path it receives.

- [ ] **Step 10: Commit guard and renderer presentation**

```bash
git add packages/map-renderer/src/projection-safety.ts \
  packages/map-renderer/src/projection-safety.test.ts \
  apps/player/app/player-map-svg.tsx \
  apps/player/app/player-map-svg.test.tsx \
  apps/player/app/globals.css
git commit -m "feat: present safe route knowledge degrees"
```

---

### Task 4: Full verification, draft PR, technical checkpoint, and canonical progress sync

**Files:**

- Create: `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`
- No code changes are allowed in this task unless a verification failure reveals a real defect; if that happens, fix via TDD, commit separately, and restart the full verification sequence.

**Interfaces:**

- Final GitHub PR target: base `foundation/player-renderer-v0`, head `foundation/player-route-knowledge-v0`.
- PR must remain `draft/open/unmerged`.
- Drive update happens only after the final documented head has green `quality` and `database` CI jobs.
- Gate 8 remains OPEN; next cut stays 8E — compact/touch node details.

- [ ] **Step 1: Run the exact local quality sequence represented in CI**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS. Pre-existing lint warnings may remain only if they are unchanged; no new lint errors or warnings introduced by 8D.

- [ ] **Step 2: Run the exact local database/security sequence represented in CI**

```bash
pnpm db:reset
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

Then perform the same type-drift proof as CI:

```bash
pnpm db:types > supabase/database.types.generated.ts
pnpm prettier --write supabase/database.types.generated.ts
diff -u supabase/database.types.ts supabase/database.types.generated.ts
rm supabase/database.types.generated.ts
```

Expected: every command passes and `diff` is empty.

- [ ] **Step 3: Audit the branch against the exact 8C base**

```bash
git diff --check 68bdd424348822e297ad4803367a16243dddb070...HEAD
git diff --name-status 68bdd424348822e297ad4803367a16243dddb070...HEAD
```

Review every changed path and verify there is no browser Supabase client, service secret, `world_private` read in player code, canonical route ID field in projection types, 8E UI, merge/deploy config, or unrelated refactor.

- [ ] **Step 4: Create the draft PR**

Create the pull request with:

```text
Title: Foundation V0 — Player Route Knowledge 8D
Base: foundation/player-renderer-v0
Head: foundation/player-route-knowledge-v0
Draft: true
```

PR body must summarize:

```markdown
## Gate 8D

- private per-player route knowledge
- service-only safe materialization into `player_api.map_routes`
- low states use authorized endpoint topology only
- confirmed+ exact geometry requires two exact endpoint projections
- ghost endpoint forces safe fallback
- direct PostgREST and real Auth A/B route leakage proofs
- six-state SVG presentation without renderer authorization logic

No merge or deploy requested.
```

- [ ] **Step 5: Verify CI on the functional head**

Read the workflow run attached to the current head and require both jobs:

```text
quality: SUCCESS
database: SUCCESS
```

The database job must still execute, in order: Supabase start, reset from Git, pgtap DB/RLS tests, PostgREST leakage smoke, real Auth A/B smoke, database type drift check, teardown.

Do not treat local success as closure if either remote job is absent or failing.

- [ ] **Step 6: Write the technical status document using concrete evidence**

Create `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md` only after the functional CI is green. Record the concrete branch, functional head SHA, workflow run number/ID, PR number, test counts shown by CI, database/RLS count, and the exact permanent smoke success messages produced by the final scripts.

The document must explicitly state:

```markdown
- PR is draft/open/unmerged.
- No deploy occurred.
- Gate 8D is implementation-complete on the functional green head.
- Final technical closure requires the documentation commit itself to remain green.
- Gate 8 overall remains open.
- Next cut: 8E — compact/touch node details.
```

- [ ] **Step 7: Update the consolidated progress document**

Append a `## Gate 8D — Route Knowledge Degrees` section to `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` describing only verified work. Do not mark future confidence/origin/freshness/privacy UI, notes, sharing, mobile interactions, or Gate 8 overall as complete.

- [ ] **Step 8: Commit documentation**

```bash
git add docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: record Gate 8D route knowledge checkpoint"
```

- [ ] **Step 9: Verify CI again on the documentation head**

Require `quality: SUCCESS` and `database: SUCCESS` on the new head. This second run is the final technical closure evidence for 8D.

- [ ] **Step 10: Re-audit final PR state and diff**

Verify:

```text
PR: OPEN
Draft: TRUE
Merged: FALSE
Base: foundation/player-renderer-v0
Head: foundation/player-route-knowledge-v0
Head SHA: exactly the final documentation head
```

Compare the branch again to `68bdd424348822e297ad4803367a16243dddb070` and confirm the final tree contains no unexpected files.

- [ ] **Step 11: Update canonical Google Drive progress only after final CI is green**

Update the canonical Master and Bootstrap Checklist with the concrete final head, PR number, final CI run, route-security behavior, final unit/DB counts, and the statement that 8A/8B/8C/8D are green while Gate 8 remains open.

The next-action text must point to 8E compact/touch node details and keep later route uncertainty features explicitly deferred.

- [ ] **Step 12: Stop before 8E implementation**

Do not merge, deploy, or begin 8E in the same closure task. Report the final 8D evidence and wait for the next explicit continuation instruction.
