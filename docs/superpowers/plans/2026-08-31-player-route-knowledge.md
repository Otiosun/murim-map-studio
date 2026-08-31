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
- Gate 8D V0 never derives a public route label/details payload from canonical `routes.name`, `payload`, or `secret_payload`: materialization writes `label = null` and `details = '{}'::jsonb`.
- Existing Gate 8B/8C permanent checks remain mandatory: RLS, PostgREST leakage smoke, real Auth A/B smoke, generated DB type-drift check, all unit tests, build, lint, format, and typecheck.
- No pan/zoom, node-detail UI, route editing, pathfinding, traversal simulation, uncertainty corridors, per-segment knowledge, Pixi/WebGPU, merge, or deploy in Gate 8D.

---

## File Structure

### New files

- `supabase/migrations/20260831062000_player_route_knowledge_v0.sql` — private route-knowledge table and service-only safe materializer.
- `supabase/tests/database/player_route_knowledge.test.sql` — pgtap proof for low/high state geometry, fallback, suppression, privileges, and A/B isolation.
- `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md` — final 8D checkpoint after remote evidence is green.

### Modified files

- `supabase/seed.sql` — adversarial canonical route fixture plus A/B route knowledge and materialization.
- `supabase/database.types.ts` — regenerated schema types.
- `scripts/database-api-leakage-test.mjs` — direct PostgREST route-leakage proof, including forbidden materializer RPC.
- `scripts/player-auth-projection-test.mjs` — real Auth A/B route isolation.
- `packages/map-renderer/src/projection-safety.ts` and `.test.ts` — route-specific canonical/source key aliases.
- `apps/player/app/player-map-svg.tsx` and `.test.tsx` — presentation metadata only; supplied geometry remains untouched.
- `apps/player/app/globals.css` — six-state route visual hierarchy.
- `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` — verified 8D progress only.

No production change is planned for `apps/player/lib/map/player-projection-source.ts` or `packages/map-renderer/src/player-projection.ts`; their existing responsibilities already match the approved design. Their existing tests remain regression gates.

---

### Task 1: Database-owned route knowledge and safe materialization

**Files:**
- Create: `supabase/tests/database/player_route_knowledge.test.sql`
- Create: `supabase/migrations/20260831062000_player_route_knowledge_v0.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/database.types.ts`

**Interfaces:**

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

```sql
server_api.refresh_player_route_projection_v1(
  p_owner_user_id uuid,
  p_source_route_id uuid
) returns void
```

The materializer reads canonical route truth only inside the trusted database boundary, derives topology only from already-authorized `player_api.map_nodes.geom`, and writes/removes exactly one player-local `player_api.map_routes` row.

- [ ] **Step 1: Write the failing database contract**

Create `supabase/tests/database/player_route_knowledge.test.sql` beginning with:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);

select has_table('world_private', 'player_route_knowledge', 'private route knowledge exists');
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
select hasnt_column('player_api', 'map_routes', 'source_route_id', 'no canonical route id');
select hasnt_column('player_api', 'map_routes', 'from_location_id', 'no canonical from-location id');
select hasnt_column('player_api', 'map_routes', 'to_location_id', 'no canonical to-location id');
```

Then prove the seeded `indication` route is topological and isolated:

```sql
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$select count(*)::bigint from player_api.map_routes$$,
  $$values (1::bigint)$$,
  'player A sees one route row'
);
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('indication'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'indication uses authorized endpoint topology'
);
```

Reset to trusted test role and explicitly exercise the other two low states against the same ghost endpoint:

```sql
reset role;
update world_private.player_route_knowledge
   set state = 'rumor', refreshed_at = '2026-08-31T06:01:00Z'
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('rumor'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'rumor never exposes canonical route geometry'
);

reset role;
update world_private.player_route_knowledge
   set state = 'localized', refreshed_at = '2026-08-31T06:02:00Z'
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('localized'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'localized still uses authorized endpoint topology'
);
select results_eq(
  $$select label, details from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values (null::text, '{}'::jsonb)$$,
  'public route label/details contain no canonical-derived payload'
);
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where extensions.st_dwithin(
        geom,
        extensions.st_setsrid(extensions.st_makepoint(1400, 100), 0),
        0.000001
      )$$,
  $$values (0::bigint)$$,
  'player A cannot recover the adversarial canonical midpoint'
);
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where projection_id = '94000000-0000-4000-8000-000000000001'::uuid$$,
  $$values (0::bigint)$$,
  'player A cannot read player B route id'
);
```

Prove exact high-state geometry for B, then confirmed-with-ghost fallback for A:

```sql
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '94000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('investigated'::text, 'LINESTRING(100 120,1400 100,900 900)'::text)$$,
  'investigated route with exact endpoints receives exact geometry'
);

reset role;
update world_private.player_route_knowledge
   set state = 'confirmed', refreshed_at = '2026-08-31T06:03:00Z'
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('confirmed'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'confirmed route with ghost endpoint still falls back safely'
);
```

Finally remove A's ghost public endpoint and prove suppression, then verify baseline privileges:

```sql
reset role;
delete from player_api.map_nodes
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and projection_id = '91000000-0000-4000-8000-000000000002'::uuid;
select server_api.refresh_player_route_projection_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid
);
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid$$,
  $$values (0::bigint)$$,
  'missing endpoint suppresses route'
);
select ok(not has_schema_privilege('authenticated', 'world_private', 'USAGE'), 'world_private stays private');
select ok(has_table_privilege('authenticated', 'player_api.map_routes', 'SELECT'), 'authenticated can select safe routes');
select ok(not has_table_privilege('authenticated', 'player_api.map_routes', 'INSERT'), 'authenticated cannot insert routes');
select * from finish();
rollback;
```

- [ ] **Step 2: Run the DB suite and verify RED**

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
```

Expected: the new test fails because the private table/materializer do not exist. Existing tests remain green up to the new contract failure.

- [ ] **Step 3: Implement the minimal migration**

Create `supabase/migrations/20260831062000_player_route_knowledge_v0.sql`:

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
  select * into v_knowledge
    from world_private.player_route_knowledge
   where owner_user_id = p_owner_user_id
     and source_route_id = p_source_route_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'route_knowledge_not_found';
  end if;

  select * into v_route from world_private.routes where id = p_source_route_id;
  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select projection_id into v_from_projection_id
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id and source_location_id = v_route.from_location_id;
  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select projection_id into v_to_projection_id
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id and source_location_id = v_route.to_location_id;
  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select role, geom into v_from_role, v_from_geom
    from player_api.map_nodes
   where owner_user_id = p_owner_user_id and projection_id = v_from_projection_id;
  if not found or v_from_geom is null then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select role, geom into v_to_role, v_to_geom
    from player_api.map_nodes
   where owner_user_id = p_owner_user_id and projection_id = v_to_projection_id;
  if not found or v_to_geom is null then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id and projection_id = v_knowledge.projection_id;
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
    owner_user_id, projection_id, from_projection_id, to_projection_id,
    label, knowledge_state, geom, details, updated_at
  ) values (
    p_owner_user_id, v_knowledge.projection_id, v_from_projection_id, v_to_projection_id,
    null, v_knowledge.state::text, v_public_geom, '{}'::jsonb, v_knowledge.refreshed_at
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

- [ ] **Step 4: Seed adversarial A/B route knowledge**

Change the existing canonical seed route to:

```sql
extensions.st_geomfromtext('LINESTRING(100 120, 1400 100, 900 900)', 0)
```

After the existing `player_api.map_nodes` seed rows, add:

```sql
insert into world_private.player_route_knowledge (
  owner_user_id, source_route_id, projection_id, state, confidence,
  origin_kind, origin_label, learned_at, refreshed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '30000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    'indication', 0.45, 'npc-rumor', 'mercador desconhecido',
    '2026-08-29T13:30:00Z', '2026-08-29T13:30:00Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '30000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'investigated', 0.95, 'personal-exploration', 'investigação própria',
    '2026-08-29T15:00:00Z', '2026-08-29T15:00:00Z'
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

- [ ] **Step 5: Rebuild and make the DB contract GREEN**

```bash
pnpm db:reset
pnpm db:test
```

Expected: all previous DB/RLS tests plus the new 20-assertion route suite pass.

- [ ] **Step 6: Regenerate checked-in database types**

```bash
pnpm db:types > supabase/database.types.generated.ts
pnpm prettier --write supabase/database.types.generated.ts
cp supabase/database.types.generated.ts supabase/database.types.ts
rm supabase/database.types.generated.ts
pnpm db:test
```

Verify generated types include `world_private.player_route_knowledge` and `server_api.refresh_player_route_projection_v1` while `player_api.map_routes` has no canonical source columns.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260831062000_player_route_knowledge_v0.sql \
  supabase/tests/database/player_route_knowledge.test.sql \
  supabase/seed.sql supabase/database.types.ts
git commit -m "feat: add safe player route knowledge materialization"
```

---

### Task 2: Direct PostgREST and real-Auth adversarial proofs

**Files:**
- Modify: `scripts/database-api-leakage-test.mjs`
- Modify: `scripts/player-auth-projection-test.mjs`

**Interfaces:**
- Player A route ID: `93000000-0000-4000-8000-000000000001`.
- Player B route ID: `94000000-0000-4000-8000-000000000001`.
- Canonical route ID: `30000000-0000-4000-8000-000000000001`; it must never occur in player JSON.
- Player A geometry must be `[[100,120],[820,860]]`; player B may receive `[[100,120],[1400,100],[900,900]]`.

- [ ] **Step 1: Extend direct PostgREST leakage assertions**

Add:

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

For A query `map_routes?select=*`, require one `indication` row, exact topological coordinates, absence of canonical route ID, B route ID, `[1400,100]`, `source_route_id`, canonical labels, and private payload keys. For B require one `investigated` row with exact adversarial geometry and no A route ID.

Add a forbidden canonical-column request:

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

And directly attempt the new RPC with a player token:

```js
const forbiddenRouteMaterialization = await rpcRequest(
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
  !forbiddenRouteMaterialization.ok,
  'authenticated player unexpectedly reached route materialization RPC',
);
```

- [ ] **Step 2: Run direct smoke**

```bash
node scripts/database-api-leakage-test.mjs
```

Expected: PASS; no key/token value is printed.

- [ ] **Step 3: Extend the real Auth A/B smoke**

Use the real A/B access tokens already created by `scripts/player-auth-projection-test.mjs` to query `player_api.map_routes`. Require A's topological geometry, B's exact investigated geometry, and zero rows when A explicitly filters `owner_user_id=eq.${PLAYER_B}`.

Use the same body-free error diagnostics already present in the script.

- [ ] **Step 4: Run security sequence**

```bash
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

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
- Regression only: `packages/map-renderer/src/player-projection.test.ts`
- Regression only: `packages/map-renderer/src/player-viewport.test.ts`
- Regression only: `apps/player/lib/map/player-projection-source.test.ts`

**Interfaces:** `ProjectionRoute.path` stays required. `PlayerMapSvg` draws exactly the supplied path and adds only `data-route-knowledge-state={route.knowledgeState}` for presentation.

- [ ] **Step 1: Write failing route-key guard tests**

Add these keys to the test fixture before production code:

```ts
'canonicalRouteId',
'canonical_route_id',
'sourceRouteId',
'source_route_id',
'fromLocationId',
'from_location_id',
'toLocationId',
'to_location_id',
```

- [ ] **Step 2: Verify RED**

```bash
pnpm vitest run packages/map-renderer/src/projection-safety.test.ts
```

Expected: the newly added aliases are not all rejected yet.

- [ ] **Step 3: Add the exact same aliases to `FORBIDDEN_PLAYER_PROJECTION_KEYS`**

Do not add a looser substring heuristic; preserve the explicit recursive allow-by-shape/deny-by-key guard style already in the package.

- [ ] **Step 4: Verify guard GREEN**

```bash
pnpm vitest run packages/map-renderer/src/projection-safety.test.ts
```

- [ ] **Step 5: Write failing SVG state metadata test**

Build route fixtures for all six states and assert:

```ts
for (const state of [
  'rumor', 'indication', 'localized',
  'confirmed', 'investigated', 'understood',
] as const) {
  expect(html).toContain(`data-route-knowledge-state="${state}"`);
}
```

At least one route must use a bent three-point `path`; assert the exact `points="..."` survives unchanged to prove the renderer does not reconstruct geometry.

- [ ] **Step 6: Verify SVG RED**

```bash
pnpm vitest run apps/player/app/player-map-svg.test.tsx
```

- [ ] **Step 7: Add presentation metadata only**

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

- [ ] **Step 8: Add six-state CSS hierarchy**

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

These values communicate state only; they never authorize precision.

- [ ] **Step 9: Focused regression run**

```bash
pnpm vitest run \
  packages/map-renderer/src/projection-safety.test.ts \
  packages/map-renderer/src/player-projection.test.ts \
  packages/map-renderer/src/player-viewport.test.ts \
  apps/player/lib/map/player-projection-source.test.ts \
  apps/player/app/player-map-svg.test.tsx
```

Expected: PASS. No production change to projection source/builder should be required.

- [ ] **Step 10: Commit**

```bash
git add packages/map-renderer/src/projection-safety.ts \
  packages/map-renderer/src/projection-safety.test.ts \
  apps/player/app/player-map-svg.tsx \
  apps/player/app/player-map-svg.test.tsx \
  apps/player/app/globals.css
git commit -m "feat: present safe route knowledge degrees"
```

---

### Task 4: Full verification, draft PR, and Gate 8D checkpoint

**Files:**
- Create: `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`

No feature code is added in this task. If verification finds a defect, fix it via a separate TDD commit and restart verification.

- [ ] **Step 1: Exact quality sequence**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS; no new lint warnings/errors.

- [ ] **Step 2: Exact database/security sequence**

```bash
pnpm db:reset
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
pnpm db:types > supabase/database.types.generated.ts
pnpm prettier --write supabase/database.types.generated.ts
diff -u supabase/database.types.ts supabase/database.types.generated.ts
rm supabase/database.types.generated.ts
```

Expected: all PASS and empty type diff.

- [ ] **Step 3: Audit against exact 8C base**

```bash
git diff --check 68bdd424348822e297ad4803367a16243dddb070...HEAD
git diff --name-status 68bdd424348822e297ad4803367a16243dddb070...HEAD
```

Reject any browser service secret, `world_private` read in player code, canonical route field in `MapProjection`, 8E UI, merge/deploy change, probe file, or unrelated refactor.

- [ ] **Step 4: Create draft PR**

Use:

```text
Title: Foundation V0 — Player Route Knowledge 8D
Base: foundation/player-renderer-v0
Head: foundation/player-route-knowledge-v0
Draft: true
```

PR body:

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

- [ ] **Step 5: Require remote CI GREEN on the functional head**

Both jobs must be present and successful:

```text
quality: SUCCESS
database: SUCCESS
```

Database evidence must still include reset from Git, pgtap suite, PostgREST smoke, Auth A/B smoke, type-drift check, and teardown.

- [ ] **Step 6: Write concrete checkpoint docs**

Create `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md` with the actual functional head SHA, actual PR number, actual workflow run ID/number, actual unit-test count, actual DB/RLS count, and exact smoke success messages observed from CI. State explicitly:

```text
PR draft/open/unmerged.
No deploy occurred.
Gate 8D implementation-complete on the functional green head.
Final technical closure requires the documentation head itself to remain green.
Gate 8 overall remains open.
Next cut: 8E — compact/touch node details.
```

Append a verified 8D section to `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`; do not mark later confidence/origin/freshness/privacy UI, notes, sharing, mobile, or Gate 8 overall complete.

- [ ] **Step 7: Commit documentation**

```bash
git add docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: record Gate 8D route knowledge checkpoint"
```

- [ ] **Step 8: Require remote CI GREEN again on the documentation head**

Require both `quality` and `database` SUCCESS on the exact new head. This is final 8D technical closure evidence.

- [ ] **Step 9: Final PR/diff audit**

Verify:

```text
PR: OPEN
Draft: TRUE
Merged: FALSE
Base: foundation/player-renderer-v0
Head: foundation/player-route-knowledge-v0
Head SHA: exact documentation head
```

Compare again to `68bdd424348822e297ad4803367a16243dddb070` and confirm no unexpected files.

- [ ] **Step 10: Update canonical Drive only after final CI is green**

Update the Master and Bootstrap Checklist with the concrete final head, PR number, final CI run, route-security behavior, actual unit/DB counts, and statement that 8A/8B/8C/8D are green while Gate 8 remains open. Next action remains 8E; uncertainty corridors/per-segment route knowledge stay deferred.

- [ ] **Step 11: Stop before 8E**

Do not merge, deploy, or start 8E in the same closure task. Report final 8D evidence and await the next explicit continuation instruction.
