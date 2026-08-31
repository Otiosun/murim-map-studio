# Player Route Knowledge V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure player-facing route knowledge degrees so low-knowledge routes expose only player-authorized topology while confirmed+ routes expose exact geometry only when both endpoint projections are exact and authorized.

**Architecture:** Canonical routes and per-player route knowledge remain in `world_private`. A service-only materializer writes already-sanitized `player_api.map_routes`; private route-knowledge triggers and player-node precision triggers keep those rows synchronized automatically so an endpoint downgrade cannot leave stale exact geometry. The application projection source remains a validator/consumer, and SVG remains presentation-only.

**Tech Stack:** PostgreSQL/PostGIS via Supabase CLI 2.115.0, PostgREST/RLS, pgtap, Node.js 24.20.0, TypeScript 6.0.2, React 19, Next.js 16.3.3, Vitest 4.1.11, pnpm 11.21.0.

**Spec:** `docs/superpowers/specs/2026-08-31-player-route-knowledge-design.md`

## Global Constraints

- Work only on `foundation/player-route-knowledge-v0`, based on exact 8C head `68bdd424348822e297ad4803367a16243dddb070`.
- `MapProjection` remains the only renderer input. No canonical route/world/endpoint IDs enter player-facing TypeScript contracts.
- `rumor`, `indication`, `localized` always use topology built from authorized player node geometry.
- `confirmed`, `investigated`, `understood` may use canonical route geometry only when both public endpoint nodes are `role = 'known'` and have geometry.
- A ghost or missing endpoint immediately forces fallback/suppression at the database boundary, including after later node precision changes.
- Direct PostgREST access to `player_api.map_routes` must be safe without React or application cooperation.
- `world_private` is unavailable to `anon`/`authenticated`; route materialization RPC is executable only by `service_role`.
- V0 materialization writes `label = null` and `details = '{}'::jsonb`; never derive player data from canonical route `name`, `payload`, or `secret_payload`.
- Keep all Gate 8B/8C permanent checks green: RLS, PostgREST smoke, Auth A/B smoke, generated DB types, all units, build, lint, format, typecheck.
- No 8E node-detail UI, pan/zoom, pathfinding, route editing, uncertainty corridors, per-segment knowledge, Pixi/WebGPU, merge, or deploy.

---

## File Structure

### New
- `supabase/migrations/20260831062000_player_route_knowledge_v0.sql`
- `supabase/tests/database/player_route_knowledge.test.sql`
- `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md`

### Modified
- `supabase/seed.sql`
- `supabase/database.types.ts`
- `scripts/database-api-leakage-test.mjs`
- `scripts/player-auth-projection-test.mjs`
- `packages/map-renderer/src/projection-safety.ts`
- `packages/map-renderer/src/projection-safety.test.ts`
- `apps/player/app/player-map-svg.tsx`
- `apps/player/app/player-map-svg.test.tsx`
- `apps/player/app/globals.css`
- `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`

No production change is planned for `apps/player/lib/map/player-projection-source.ts` or `packages/map-renderer/src/player-projection.ts`; their existing tests stay as regression gates.

---

### Task 1: Private route knowledge + automatically synchronized safe projection

**Files:**
- Create: `supabase/tests/database/player_route_knowledge.test.sql`
- Create: `supabase/migrations/20260831062000_player_route_knowledge_v0.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/database.types.ts`

**Produces:**

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

Internal triggers:

```text
world_private.sync_player_route_knowledge_projection_v1()
world_private.refresh_routes_for_player_node_v1()
```

The first syncs INSERT/UPDATE/DELETE of route knowledge. The second re-evaluates connected routes whenever a public player node is inserted/deleted or its `role`/`geom` precision changes.

- [ ] **Step 1: Write RED pgtap contract**

Create `supabase/tests/database/player_route_knowledge.test.sql` with `select plan(22);`. Start with schema/privilege assertions:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

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

Prove player A's seeded `indication` is topological:

```sql
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select count(*)::bigint from player_api.map_routes$$,
  $$values (1::bigint)$$,
  'player A sees one route'
);
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('indication'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'indication uses authorized endpoint topology'
);
```

Update route knowledge **without calling refresh manually** and prove database trigger synchronization for the other low states:

```sql
reset role;
update world_private.player_route_knowledge
   set state = 'rumor', refreshed_at = '2026-08-31T06:01:00Z'
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('rumor'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'rumor auto-syncs to safe topology'
);

reset role;
update world_private.player_route_knowledge
   set state = 'localized', refreshed_at = '2026-08-31T06:02:00Z'
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('localized'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'localized auto-syncs to safe topology'
);
select results_eq(
  $$select label, details from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values (null::text, '{}'::jsonb)$$,
  'route label/details contain no canonical-derived payload'
);
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where extensions.st_dwithin(
        geom,
        extensions.st_setsrid(extensions.st_makepoint(1400,100),0),
        0.000001
      )$$,
  $$values (0::bigint)$$,
  'player A cannot recover canonical midpoint'
);
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where projection_id = '94000000-0000-4000-8000-000000000001'::uuid$$,
  $$values (0::bigint)$$,
  'player A cannot see player B route id'
);
```

Prove B initially receives exact investigated geometry, then downgrade B's endpoint node to ghost **without touching route knowledge** and require the node trigger to remove exact route precision immediately:

```sql
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '94000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('investigated'::text, 'LINESTRING(100 120,1400 100,900 900)'::text)$$,
  'investigated route with exact endpoints may expose exact geometry'
);

reset role;
update player_api.map_nodes
   set role = 'ghost',
       geom = extensions.st_setsrid(extensions.st_makepoint(860,850),0),
       approximate_radius = 120
 where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
   and projection_id = '92000000-0000-4000-8000-000000000002'::uuid;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '94000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('investigated'::text, 'LINESTRING(100 120,860 850)'::text)$$,
  'endpoint downgrade immediately removes exact route geometry'
);
```

Restore B's node for later cleanup, then prove deleting private route knowledge automatically removes the public row:

```sql
reset role;
update player_api.map_nodes
   set role = 'known',
       geom = extensions.st_setsrid(extensions.st_makepoint(900,900),0),
       approximate_radius = null
 where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
   and projection_id = '92000000-0000-4000-8000-000000000002'::uuid;
delete from world_private.player_route_knowledge
 where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid$$,
  $$values (0::bigint)$$,
  'deleting private route knowledge cleans public projection'
);
```

Prove high state + ghost fallback for A, then node deletion suppression, plus baseline privileges:

```sql
update world_private.player_route_knowledge
   set state = 'confirmed', refreshed_at = '2026-08-31T06:03:00Z'
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select results_eq(
  $$select knowledge_state, extensions.st_astext(geom)
      from player_api.map_routes
      where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('confirmed'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'confirmed route with ghost endpoint falls back safely'
);

reset role;
delete from player_api.map_nodes
 where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
   and projection_id = '91000000-0000-4000-8000-000000000002'::uuid;
select results_eq(
  $$select count(*)::bigint from player_api.map_routes
      where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid$$,
  $$values (0::bigint)$$,
  'missing endpoint automatically suppresses route'
);
select ok(not has_schema_privilege('authenticated','world_private','USAGE'), 'world_private remains private');
select ok(has_table_privilege('authenticated','player_api.map_routes','SELECT'), 'authenticated can select safe routes');
select ok(not has_table_privilege('authenticated','player_api.map_routes','INSERT'), 'authenticated cannot insert routes');
select * from finish();
rollback;
```

- [ ] **Step 2: Run DB suite and verify RED**

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
```

Expected: new suite fails because table/functions/triggers do not exist yet; old suites remain green before that new failure.

- [ ] **Step 3: Create migration with table + materializer**

Create `supabase/migrations/20260831062000_player_route_knowledge_v0.sql` starting with:

```sql
begin;

create table world_private.player_route_knowledge (
  owner_user_id uuid not null,
  source_route_id uuid not null references world_private.routes(id) on delete cascade,
  projection_id uuid not null,
  state world_private.knowledge_state not null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  origin_kind text not null check (btrim(origin_kind) <> ''),
  origin_label text,
  learned_at timestamptz not null,
  refreshed_at timestamptz not null,
  primary key (owner_user_id, source_route_id),
  unique (owner_user_id, projection_id)
);
create index player_route_knowledge_owner_idx
  on world_private.player_route_knowledge(owner_user_id);
revoke all on world_private.player_route_knowledge from public, anon, authenticated;
grant all on world_private.player_route_knowledge to service_role;
```

Add the service-only materializer:

```sql
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
  v_k world_private.player_route_knowledge%rowtype;
  v_r world_private.routes%rowtype;
  v_from_id uuid;
  v_to_id uuid;
  v_from_role text;
  v_to_role text;
  v_from_geom extensions.geometry;
  v_to_geom extensions.geometry;
  v_public_geom extensions.geometry;
begin
  select * into v_k from world_private.player_route_knowledge
   where owner_user_id = p_owner_user_id and source_route_id = p_source_route_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'route_knowledge_not_found';
  end if;

  select * into v_r from world_private.routes where id = p_source_route_id;
  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id and projection_id = v_k.projection_id;
    return;
  end if;

  select projection_id into v_from_id from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id and source_location_id = v_r.from_location_id;
  if not found then
    delete from player_api.map_routes where owner_user_id = p_owner_user_id and projection_id = v_k.projection_id;
    return;
  end if;
  select projection_id into v_to_id from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id and source_location_id = v_r.to_location_id;
  if not found then
    delete from player_api.map_routes where owner_user_id = p_owner_user_id and projection_id = v_k.projection_id;
    return;
  end if;

  select role, geom into v_from_role, v_from_geom from player_api.map_nodes
   where owner_user_id = p_owner_user_id and projection_id = v_from_id;
  if not found or v_from_geom is null then
    delete from player_api.map_routes where owner_user_id = p_owner_user_id and projection_id = v_k.projection_id;
    return;
  end if;
  select role, geom into v_to_role, v_to_geom from player_api.map_nodes
   where owner_user_id = p_owner_user_id and projection_id = v_to_id;
  if not found or v_to_geom is null then
    delete from player_api.map_routes where owner_user_id = p_owner_user_id and projection_id = v_k.projection_id;
    return;
  end if;

  v_public_geom := case
    when v_k.state in ('confirmed','investigated','understood')
      and v_from_role = 'known' and v_to_role = 'known'
      then v_r.geom
    else extensions.st_makeline(v_from_geom, v_to_geom)
  end;

  insert into player_api.map_routes (
    owner_user_id, projection_id, from_projection_id, to_projection_id,
    label, knowledge_state, geom, details, updated_at
  ) values (
    p_owner_user_id, v_k.projection_id, v_from_id, v_to_id,
    null, v_k.state::text, v_public_geom, '{}'::jsonb, v_k.refreshed_at
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
revoke all on function server_api.refresh_player_route_projection_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function server_api.refresh_player_route_projection_v1(uuid,uuid)
  to service_role;
```

- [ ] **Step 4: Add automatic route-knowledge lifecycle trigger**

```sql
create function world_private.sync_player_route_knowledge_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, server_api
as $$
begin
  if tg_op = 'DELETE' then
    delete from player_api.map_routes
     where owner_user_id = old.owner_user_id and projection_id = old.projection_id;
    return old;
  end if;

  perform server_api.refresh_player_route_projection_v1(new.owner_user_id, new.source_route_id);
  return new;
end;
$$;
revoke all on function world_private.sync_player_route_knowledge_projection_v1()
  from public, anon, authenticated;

create trigger player_route_knowledge_projection_sync
  after insert or update or delete on world_private.player_route_knowledge
  for each row execute function world_private.sync_player_route_knowledge_projection_v1();
```

- [ ] **Step 5: Add automatic endpoint-precision synchronization**

```sql
create function world_private.refresh_routes_for_player_node_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, server_api
as $$
declare
  v_owner uuid;
  v_projection uuid;
  v_source_location uuid;
  v_route record;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_user_id;
    v_projection := old.projection_id;
  else
    v_owner := new.owner_user_id;
    v_projection := new.projection_id;
  end if;

  select source_location_id into v_source_location
    from world_private.player_location_knowledge
   where owner_user_id = v_owner and projection_id = v_projection;

  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  for v_route in
    select k.source_route_id
      from world_private.player_route_knowledge k
      join world_private.routes r on r.id = k.source_route_id
     where k.owner_user_id = v_owner
       and (r.from_location_id = v_source_location or r.to_location_id = v_source_location)
  loop
    perform server_api.refresh_player_route_projection_v1(v_owner, v_route.source_route_id);
  end loop;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function world_private.refresh_routes_for_player_node_v1()
  from public, anon, authenticated;

create trigger player_map_node_route_sync_insert_delete
  after insert or delete on player_api.map_nodes
  for each row execute function world_private.refresh_routes_for_player_node_v1();
create trigger player_map_node_route_sync_precision_update
  after update of role, geom on player_api.map_nodes
  for each row execute function world_private.refresh_routes_for_player_node_v1();

commit;
```

The node trigger must never read canonical coordinates to build fallback geometry; it only identifies which private route records require the service materializer to re-evaluate their already-public endpoints.

- [ ] **Step 6: Seed adversarial A/B route knowledge**

Change canonical route geometry to:

```sql
extensions.st_geomfromtext('LINESTRING(100 120, 1400 100, 900 900)',0)
```

After public node seeds, insert:

```sql
insert into world_private.player_route_knowledge (
  owner_user_id, source_route_id, projection_id, state, confidence,
  origin_kind, origin_label, learned_at, refreshed_at
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','30000000-0000-4000-8000-000000000001',
   '93000000-0000-4000-8000-000000000001','indication',0.45,
   'npc-rumor','mercador desconhecido','2026-08-29T13:30:00Z','2026-08-29T13:30:00Z'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','30000000-0000-4000-8000-000000000001',
   '94000000-0000-4000-8000-000000000001','investigated',0.95,
   'personal-exploration','investigação própria','2026-08-29T15:00:00Z','2026-08-29T15:00:00Z');
```

Do **not** manually insert `player_api.map_routes`; the route-knowledge trigger is part of what the seed validates.

- [ ] **Step 7: Rebuild and verify GREEN**

```bash
pnpm db:reset
pnpm db:test
```

Expected: all previous DB/RLS tests plus the 22-assertion route suite pass.

- [ ] **Step 8: Regenerate checked-in DB types and re-test**

```bash
pnpm db:types > supabase/database.types.generated.ts
pnpm prettier --write supabase/database.types.generated.ts
cp supabase/database.types.generated.ts supabase/database.types.ts
rm supabase/database.types.generated.ts
pnpm db:test
```

Generated types must include the private route table + service materializer and must not add canonical columns to `player_api.map_routes`.

- [ ] **Step 9: Commit**

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

**Constants:**

```js
const CANONICAL_ROUTE_ID = '30000000-0000-4000-8000-000000000001';
const PLAYER_A_ROUTE_PROJECTION_ID = '93000000-0000-4000-8000-000000000001';
const PLAYER_B_ROUTE_PROJECTION_ID = '94000000-0000-4000-8000-000000000001';
```

- [ ] **Step 1: Extend direct PostgREST smoke**

Add:

```js
function assertLineString(row, expected, context) {
  assert(row?.geom?.type === 'LineString', `${context} is not a LineString`);
  assert(
    JSON.stringify(row.geom.coordinates) === JSON.stringify(expected),
    `${context} coordinates are not the expected authorized geometry`,
  );
}
```

Query `map_routes?select=*` for A and require exactly one `indication` route with `[[100,120],[820,860]]`, no canonical route ID, no B route ID, no `[1400,100]`, `label === null`, empty `details`, and no `source_route_id`/private payload keys. Query B and require exactly one `investigated` route with `[[100,120],[1400,100],[900,900]]` and no A route ID.

Try forbidden column selection:

```js
const forbiddenRouteColumnResponse = await request(
  env.API_URL, env.ANON_KEY, playerAJwt,
  'player_api', 'map_routes?select=source_route_id'
);
assert(!forbiddenRouteColumnResponse.ok, 'player_api unexpectedly exposes source_route_id');
```

Try the service-only materializer using a player token:

```js
const forbiddenRouteMaterialization = await rpcRequest(
  env.API_URL,
  env.ANON_KEY,
  playerAJwt,
  'server_api',
  'refresh_player_route_projection_v1',
  { p_owner_user_id: PLAYER_A, p_source_route_id: CANONICAL_ROUTE_ID },
);
assert(!forbiddenRouteMaterialization.ok, 'player reached route materialization RPC');
```

- [ ] **Step 2: Run direct smoke**

```bash
node scripts/database-api-leakage-test.mjs
```

Expected: PASS; no token/key values in logs.

- [ ] **Step 3: Extend real Auth A/B smoke**

Using existing real access tokens, query `player_api.map_routes`. Require A topology, B exact investigated geometry, absence of the other player's projection IDs, and zero results when A filters `owner_user_id=eq.${PLAYER_B}`. Preserve existing body-free error diagnostics.

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

### Task 3: Route anti-leak guard + SVG knowledge presentation

**Files:**
- Modify: `packages/map-renderer/src/projection-safety.test.ts`
- Modify: `packages/map-renderer/src/projection-safety.ts`
- Modify: `apps/player/app/player-map-svg.test.tsx`
- Modify: `apps/player/app/player-map-svg.tsx`
- Modify: `apps/player/app/globals.css`
- Regression only: `packages/map-renderer/src/player-projection.test.ts`
- Regression only: `packages/map-renderer/src/player-viewport.test.ts`
- Regression only: `apps/player/lib/map/player-projection-source.test.ts`

- [ ] **Step 1: Write RED route-key guard tests**

Add to the test fixture:

```ts
'canonicalRouteId', 'canonical_route_id',
'sourceRouteId', 'source_route_id',
'fromLocationId', 'from_location_id',
'toLocationId', 'to_location_id',
```

- [ ] **Step 2: Verify RED, implement explicit guard keys, verify GREEN**

```bash
pnpm vitest run packages/map-renderer/src/projection-safety.test.ts
```

Add exactly those keys to `FORBIDDEN_PLAYER_PROJECTION_KEYS`; do not introduce substring heuristics. Re-run the same command and require PASS.

- [ ] **Step 3: Write RED SVG state test**

Create fixtures for all six states and assert:

```ts
for (const state of [
  'rumor','indication','localized','confirmed','investigated','understood',
] as const) {
  expect(html).toContain(`data-route-knowledge-state="${state}"`);
}
```

Keep at least one bent 3-point path and assert its exact `points="..."`; renderer must not reconstruct topology.

- [ ] **Step 4: Verify RED and add presentation metadata only**

```bash
pnpm vitest run apps/player/app/player-map-svg.test.tsx
```

Then change the existing polyline to:

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

- [ ] **Step 5: Add visual hierarchy**

```css
.player-map-svg [data-route-knowledge-state='rumor'] { stroke-dasharray: 1 5; opacity: 0.22; }
.player-map-svg [data-route-knowledge-state='indication'] { stroke-dasharray: 3 5; opacity: 0.36; }
.player-map-svg [data-route-knowledge-state='localized'] { stroke-dasharray: 6 4; opacity: 0.5; }
.player-map-svg [data-route-knowledge-state='confirmed'] { stroke-dasharray: none; opacity: 0.65; }
.player-map-svg [data-route-knowledge-state='investigated'] { stroke-dasharray: none; stroke-width: 1.5; opacity: 0.78; }
.player-map-svg [data-route-knowledge-state='understood'] { stroke-dasharray: none; stroke-width: 1.75; opacity: 0.9; }
```

These styles describe epistemic state only; DB geometry remains the sole precision authority.

- [ ] **Step 6: Focused regression run**

```bash
pnpm vitest run \
  packages/map-renderer/src/projection-safety.test.ts \
  packages/map-renderer/src/player-projection.test.ts \
  packages/map-renderer/src/player-viewport.test.ts \
  apps/player/lib/map/player-projection-source.test.ts \
  apps/player/app/player-map-svg.test.tsx
```

Expected: PASS; no production source/builder change required.

- [ ] **Step 7: Commit**

```bash
git add packages/map-renderer/src/projection-safety.ts \
  packages/map-renderer/src/projection-safety.test.ts \
  apps/player/app/player-map-svg.tsx apps/player/app/player-map-svg.test.tsx \
  apps/player/app/globals.css
git commit -m "feat: present safe route knowledge degrees"
```

---

### Task 4: Full verification, draft PR, technical closure, Drive sync

**Files:**
- Create: `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`

If any verification fails, fix via a separate TDD commit and restart this task from Step 1.

- [ ] **Step 1: Run exact quality sequence**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS; no new lint warnings/errors.

- [ ] **Step 2: Run exact database/security sequence + type drift**

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

Expected: all PASS and empty diff.

- [ ] **Step 3: Audit against exact 8C base**

```bash
git diff --check 68bdd424348822e297ad4803367a16243dddb070...HEAD
git diff --name-status 68bdd424348822e297ad4803367a16243dddb070...HEAD
```

Reject browser secrets, player `world_private` reads, canonical route fields in `MapProjection`, 8E UI, merge/deploy changes, probe files, or unrelated refactors.

- [ ] **Step 4: Create draft PR**

```text
Title: Foundation V0 — Player Route Knowledge 8D
Base: foundation/player-renderer-v0
Head: foundation/player-route-knowledge-v0
Draft: true
```

Body:

```markdown
## Gate 8D

- private per-player route knowledge
- automatic database-owned safe materialization into `player_api.map_routes`
- low states use authorized endpoint topology only
- confirmed+ exact geometry requires two exact endpoint projections
- endpoint precision changes automatically re-sanitize connected routes
- direct PostgREST and real Auth A/B leakage proofs
- six-state SVG presentation without renderer authorization logic

No merge or deploy requested.
```

- [ ] **Step 5: Require remote CI GREEN on functional head**

Require both `quality: SUCCESS` and `database: SUCCESS`, with DB reset, pgtap, PostgREST smoke, Auth A/B smoke, generated-type drift check, teardown all present.

- [ ] **Step 6: Write concrete status/progress docs**

Create `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md` with actual functional SHA, actual PR number, actual workflow run, actual unit count, actual DB/RLS count, and exact smoke success messages. State:

```text
PR draft/open/unmerged.
No deploy occurred.
Gate 8D implementation-complete on the functional green head.
Final technical closure requires documentation head itself to stay green.
Gate 8 overall remains open.
Next cut: 8E — compact/touch node details.
```

Append verified 8D facts to `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`; do not mark later confidence/origin/freshness/privacy UI, notes, sharing, mobile, or Gate 8 complete.

- [ ] **Step 7: Commit docs and require CI GREEN again**

```bash
git add docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: record Gate 8D route knowledge checkpoint"
```

Require `quality` and `database` SUCCESS on this exact documentation head.

- [ ] **Step 8: Final PR/diff audit**

Verify:

```text
PR: OPEN
Draft: TRUE
Merged: FALSE
Base: foundation/player-renderer-v0
Head: foundation/player-route-knowledge-v0
Head SHA: exact final documentation head
```

Compare again to `68bdd424348822e297ad4803367a16243dddb070` and confirm no unexpected files.

- [ ] **Step 9: Update canonical Drive only after final CI GREEN**

Update Master and Bootstrap Checklist with concrete final head, PR, CI run, route-security semantics, actual unit/DB counts, and 8A/8B/8C/8D green while Gate 8 stays open. Keep 8E next; uncertainty corridors/per-segment route knowledge remain deferred.

- [ ] **Step 10: Stop before 8E**

Do not merge, deploy, or start 8E. Report final 8D evidence and await the next explicit continuation instruction.
