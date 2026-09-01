# Player Knowledge Metadata 8F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw player-facing knowledge precision with a reusable, strictly typed confidence/source/freshness/privacy presentation envelope for nodes and routes, backed by narrative world time and preserved anti-leak guarantees.

**Architecture:** Keep raw confidence, canonical source context and narrative-time coordinates private in `world_private`. Trusted database materialization converts them into five constrained player-safe columns in `player_api`; the Player adapter parses those values into one common `ProjectionKnowledgePresentation`, and the existing node detail panel formats that already-authorized envelope without new fetches. World-time advancement is a monotonic private mutation whose transaction recalculates only materialized freshness; it does not introduce autonomous clocks, calendars or browser time calculations.

**Tech Stack:** Next.js 16.3.3, React 19.2.x, TypeScript 6.0.2, Zod 4.4.3, Vitest 4.1.11, jsdom 30.0.1, Supabase CLI 2.115.0, PostgreSQL/PostGIS, pgTAP, pnpm 11.21.0.

**Spec:** `docs/superpowers/specs/2026-09-01-player-knowledge-metadata-design.md`

## Global Constraints

- Base for 8F is Gate 8E final head `c4a6a90bfeffd5c20d3608f27bc52423e8291563` from `foundation/player-node-details-v0`.
- Work only on `foundation/player-knowledge-metadata-v0`; do not merge or deploy.
- `MapProjection` remains the only map-knowledge presentation contract delivered by the Player path.
- Browser/request identity never selects `playerId`; the existing authenticated server-side session remains authoritative.
- No service-role credential, browser Supabase client, `world_private` query/import, canonical lookup, source lookup or new selection-time request may enter `apps/player`.
- Raw numeric confidence remains private and must disappear from player-readable `player_api` and serialized Player `MapProjection`.
- Player-facing confidence values are exactly `low | moderate | high | very-high` using thresholds `[0,.40)`, `[.40,.70)`, `[.70,.90)`, `[.90,1]`.
- Player-facing source kinds are exactly `system | exploration | npc | player | document | scene`.
- A source label is exposed only when trusted private state explicitly marks that identity as known to the character; private `origin_label` alone is insufficient.
- Player-facing source labels are trimmed plain text, non-empty when present, maximum 120 characters, and never contain canonical/source/world/owner IDs as fallback values.
- Player-facing freshness values are exactly `just-updated | recent | aging | stale | not-applicable` and are derived only from narrative world minutes.
- `learned_at`, `refreshed_at`, JavaScript `Date`, request time and wall-clock time never determine narrative freshness.
- Narrative world minutes are non-negative integers; world current minute is monotonic and cannot regress.
- `learned_world_minute <= refreshed_world_minute <= current_world_minute` is required when projecting knowledge.
- Missing `freshness_window_minutes` means `not-applicable`; a present window is a positive integer.
- Player-facing privacy values are exactly `private | shared | public`; they are descriptive metadata, not ACLs.
- Confidence, freshness, source and privacy never change `knowledgeState`, node geometry, ghost radius, route geometry precision, item visibility authorization or RLS behavior.
- Route precision rules from 8D remain unchanged byte-for-byte in intent: confirmed+ route geometry is exact only when both authorized endpoints are exact; otherwise topology is derived only from authorized endpoints.
- Node selection behavior from 8E remains local and causes no fetch, server action or truth lookup.
- Full calendar/time-of-day/season logic, autonomous ticking, faction clocks, private notes, actual sharing actions, route-detail interaction and full Playwright device coverage are outside 8F.
- All schema changes are versioned migrations; no dashboard-only database changes.
- Database clients retain SELECT-only access to own `player_api` rows under existing RLS.
- Raw database/internal errors remain sanitized by the existing Player home/API behavior.

---

## File Map

### Create

- `supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql` — narrative-minute primitive, private metadata constraints, safe materialization helpers/triggers, player-safe columns, raw player confidence removal, route materializer replacement.
- `supabase/tests/database/player_knowledge_metadata.test.sql` — pgTAP proof for confidence thresholds, safe source identity, privacy, freshness edges, monotonic world time, atomic freshness refresh and absence of raw confidence.
- `packages/map-renderer/src/knowledge-presentation.ts` — shared semantic constants/types for confidence, source, freshness and privacy.
- `docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md` — final 8F evidence/status after functional CI is green.

### Modify

- `supabase/seed.sql` — deterministic narrative-time/private metadata fixtures and safe node projection inserts.
- `supabase/migrations/20260831062000_player_route_knowledge_v0.sql` is **not edited**; the new migration replaces its function with `create or replace` so migration history remains append-only.
- `supabase/tests/database/player_route_knowledge.test.sql` — preserve 8D route precision assertions while adding metadata-preservation coverage where useful.
- `supabase/tests/database/rls.test.sql` — A/B safe metadata visibility and mutation denial.
- `supabase/database.types.ts` — regenerate after the migration.
- `scripts/database-api-leakage-test.mjs` — PostgREST A/B assertions for semantic metadata and absence of raw/private fields.
- `scripts/player-auth-projection-test.mjs` — real Auth A/B assertions for the same contract.
- `packages/map-renderer/src/index.ts` — export the common presentation contract.
- `packages/map-renderer/src/projection.ts` — require `knowledgePresentation` on Player nodes/routes and remove numeric `confidence` from nodes.
- `packages/map-renderer/src/player-projection.ts` — consume/copy the common envelope for nodes/routes instead of numeric confidence.
- `packages/map-renderer/src/player-projection.test.ts` — common node/route envelope and raw-confidence-absence tests.
- `packages/map-renderer/src/projection-safety.test.ts` — adversarial nested source/metadata key tests.
- `packages/map-renderer/src/projection-route-safety.test.ts` — route precision regression with metadata present.
- `packages/world-schema/src/schemas.ts` — strict common presentation schema on nodes/routes; numeric projection confidence removed.
- `packages/world-schema/src/schemas.test.ts` — strict enum/unknown-key/source-label/raw-confidence tests.
- `apps/player/lib/map/player-projection-source.ts` — select/strictly parse the five player-safe semantic columns for nodes/routes.
- `apps/player/lib/map/player-projection-source.test.ts` — adapter exact-select, valid/invalid envelope and raw-confidence regression tests.
- `apps/player/lib/map/player-node-detail-model.ts` — copy the safe envelope into the geometry-free client view and centralize Portuguese formatting.
- `apps/player/lib/map/player-node-detail-model.test.ts` — presentation copy and minimization tests.
- `apps/player/app/player-map-explorer.tsx` — render compact metadata rows inside the existing non-modal panel only.
- `apps/player/app/player-map-explorer.test.tsx` — interaction/network regressions plus metadata copy.
- `apps/player/app/player-map-svg.tsx` — semantic confidence/freshness data hooks only; no geometry or visibility changes.
- `apps/player/app/player-map-svg.test.tsx` — hooks plus exact route/node geometry regression.
- `apps/player/app/player-map-styles.test.ts` — confirm styling selectors remain presentation-only.
- `apps/player/app/globals.css` — compact metadata layout and only subtle confidence/freshness presentation.
- `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` — 8F closure evidence after CI is green.

---

### Task 1: Add narrative-time and private knowledge primitives

**Files:**
- Create: `supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql`
- Create: `supabase/tests/database/player_knowledge_metadata.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Produces database fields: `world_private.worlds.current_world_minute`, `origin_label_known`, `learned_world_minute`, `refreshed_world_minute`, `freshness_window_minutes`, `privacy` on both private knowledge tables.
- Produces server-only functions: `server_api.player_confidence_band_v1(numeric)` and `server_api.player_freshness_v1(bigint,bigint,bigint)`.
- Consumed by Task 2 materialization.

- [ ] **Step 1: Write the first RED pgTAP contract**

Create `supabase/tests/database/player_knowledge_metadata.test.sql` with a transaction, pgTAP setup and assertions that currently fail because the fields/functions do not exist. Start with these structural checks:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

select has_column('world_private', 'worlds', 'current_world_minute', 'world has narrative minute');
select has_column('world_private', 'player_location_knowledge', 'refreshed_world_minute', 'location knowledge has narrative refresh minute');
select has_column('world_private', 'player_route_knowledge', 'refreshed_world_minute', 'route knowledge has narrative refresh minute');
select has_column('world_private', 'player_location_knowledge', 'origin_label_known', 'location source identity has explicit known flag');
select has_column('world_private', 'player_route_knowledge', 'origin_label_known', 'route source identity has explicit known flag');
select has_column('world_private', 'player_location_knowledge', 'freshness_window_minutes', 'location knowledge can opt into staleness');
select has_column('world_private', 'player_route_knowledge', 'privacy', 'route knowledge has privacy metadata');

select is(server_api.player_confidence_band_v1(0.3999), 'low'::text, '0.3999 is low');
select is(server_api.player_confidence_band_v1(0.4000), 'moderate'::text, '0.4 is moderate');
select is(server_api.player_confidence_band_v1(0.7000), 'high'::text, '0.7 is high');
select is(server_api.player_confidence_band_v1(0.9000), 'very-high'::text, '0.9 is very high');

select is(server_api.player_freshness_v1(100, 100, 60), 'just-updated'::text, 'age zero is just updated');
select is(server_api.player_freshness_v1(129, 100, 60), 'recent'::text, 'first half of window is recent');
select is(server_api.player_freshness_v1(130, 100, 60), 'aging'::text, 'half window is aging');
select is(server_api.player_freshness_v1(160, 100, 60), 'stale'::text, 'full window is stale');
select is(server_api.player_freshness_v1(500, 100, null), 'not-applicable'::text, 'missing window does not invent staleness');

select ok(
  not has_function_privilege('authenticated', 'server_api.player_confidence_band_v1(numeric)', 'EXECUTE'),
  'authenticated cannot invoke confidence materialization helper'
);
select ok(
  has_function_privilege('service_role', 'server_api.player_confidence_band_v1(numeric)', 'EXECUTE'),
  'service role can invoke confidence materialization helper'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the new database test and confirm RED**

```bash
pnpm db:start
pnpm db:reset
pnpm supabase test db supabase/tests/database/player_knowledge_metadata.test.sql
```

Expected: FAIL on missing columns/functions.

- [ ] **Step 3: Add the minimum schema primitives in the new migration**

Add `current_world_minute`:

```sql
alter table world_private.worlds
  add column current_world_minute bigint not null default 0
  check (current_world_minute >= 0);
```

For both `world_private.player_location_knowledge` and `world_private.player_route_knowledge`, add:

```sql
origin_label_known boolean not null default false,
learned_world_minute bigint not null default 0,
refreshed_world_minute bigint not null default 0,
freshness_window_minutes bigint,
privacy text not null default 'private'
```

Then add checks equivalent to:

```sql
check (learned_world_minute >= 0),
check (refreshed_world_minute >= 0),
check (learned_world_minute <= refreshed_world_minute),
check (freshness_window_minutes is null or freshness_window_minutes > 0),
check (privacy in ('private','shared','public'))
```

Normalize existing seed-era origin kinds before adding the strict source-kind check:

```sql
update world_private.player_location_knowledge
set privacy = case when origin_kind = 'shared-map' then 'shared' else privacy end;
update world_private.player_route_knowledge
set privacy = case when origin_kind = 'shared-map' then 'shared' else privacy end;

update world_private.player_location_knowledge
set origin_kind = case origin_kind
  when 'personal-exploration' then 'exploration'
  when 'npc-rumor' then 'npc'
  when 'shared-map' then 'player'
  else origin_kind
end;

update world_private.player_route_knowledge
set origin_kind = case origin_kind
  when 'personal-exploration' then 'exploration'
  when 'npc-rumor' then 'npc'
  when 'shared-map' then 'player'
  else origin_kind
end;
```

Add a fail-fast `do $$ ... $$` block that raises `unsupported_knowledge_origin_kind` if any private row remains outside `system, exploration, npc, player, document, scene`, then add the corresponding CHECK constraint to both tables.

For `origin_label_known = true`, constrain `origin_label` to `origin_label = btrim(origin_label)`, `char_length(origin_label) between 1 and 120`. Do not require a label when the flag is false.

- [ ] **Step 4: Add server-only deterministic classifier functions**

Use immutable SQL/PLpgSQL helpers:

```sql
create function server_api.player_confidence_band_v1(p_confidence numeric)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception using errcode = '22023', message = 'invalid_player_confidence';
  end if;
  if p_confidence < 0.40 then return 'low'; end if;
  if p_confidence < 0.70 then return 'moderate'; end if;
  if p_confidence < 0.90 then return 'high'; end if;
  return 'very-high';
end;
$$;
```

Freshness must avoid floating-point thresholds:

```sql
create function server_api.player_freshness_v1(
  p_current_world_minute bigint,
  p_refreshed_world_minute bigint,
  p_window_minutes bigint
)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  v_age bigint;
begin
  if p_current_world_minute < 0 or p_refreshed_world_minute < 0 then
    raise exception using errcode = '22023', message = 'invalid_world_minute';
  end if;
  if p_refreshed_world_minute > p_current_world_minute then
    raise exception using errcode = '22023', message = 'future_knowledge_world_minute';
  end if;
  if p_window_minutes is null then return 'not-applicable'; end if;
  if p_window_minutes <= 0 then
    raise exception using errcode = '22023', message = 'invalid_freshness_window';
  end if;
  v_age := p_current_world_minute - p_refreshed_world_minute;
  if v_age = 0 then return 'just-updated'; end if;
  if v_age * 2 < p_window_minutes then return 'recent'; end if;
  if v_age < p_window_minutes then return 'aging'; end if;
  return 'stale';
end;
$$;
```

Revoke both from `public, anon, authenticated`; grant execute only to `service_role`.

- [ ] **Step 5: Add monotonic world-minute protection**

Add a private trigger function and trigger:

```sql
create function world_private.guard_world_minute_monotonic_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.current_world_minute < old.current_world_minute then
    raise exception using errcode = '22023', message = 'world_minute_regression';
  end if;
  return new;
end;
$$;

create trigger worlds_world_minute_monotonic
before update of current_world_minute on world_private.worlds
for each row execute function world_private.guard_world_minute_monotonic_v1();
```

No autonomous advancement is added.

- [ ] **Step 6: Update deterministic seed private metadata**

Set the seeded world `current_world_minute` explicitly to `1440` in its `insert into world_private.worlds` column list.

Replace seed `origin_kind` values with allowed categories and add the new private columns to all location/route knowledge inserts. Use these deterministic semantics:

```text
Player A / Vila Qinghe: exploration, known label “Chegada própria”, private, refreshed minute 1440, no freshness window.
Player A / hidden rumor: npc, origin label stored privately but origin_label_known=false, private, refreshed minute 1380, window 240.
Player B / Vila Qinghe: player, known label “Contato confiável”, shared, refreshed minute 1320, window 480.
Player B / Mosteiro: exploration, known label “Investigação própria”, private, refreshed minute 1440, no window.
Player A route: npc, unknown specific label, private, refreshed minute 1380, window 180.
Player B route: exploration, known label “Investigação própria”, private, refreshed minute 1440, no window.
```

Keep real `learned_at/refreshed_at` timestamps unchanged as audit data.

- [ ] **Step 7: Run the new pgTAP test and database reset**

```bash
pnpm db:reset
pnpm supabase test db supabase/tests/database/player_knowledge_metadata.test.sql
```

Expected: PASS for structural/classifier assertions.

- [ ] **Step 8: Commit Task 1**

```bash
git add supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql supabase/tests/database/player_knowledge_metadata.test.sql supabase/seed.sql
git commit -m "feat: add narrative knowledge metadata primitives"
```

---

### Task 2: Materialize only player-safe knowledge metadata

**Files:**
- Modify: `supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql`
- Modify: `supabase/tests/database/player_knowledge_metadata.test.sql`
- Modify: `supabase/tests/database/player_route_knowledge.test.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/database.types.ts`

**Interfaces:**
- Produces player-safe columns on both projection tables: `confidence_band`, `source_kind`, `source_label`, `freshness`, `privacy`.
- Removes `player_api.map_nodes.confidence`.
- Produces/updates server-only materialization functions and triggers.
- Guarantees advancing world minute refreshes safe freshness atomically.
- Consumed by Tasks 3–4.

- [ ] **Step 1: Extend pgTAP with RED player-facing schema assertions**

Add assertions before implementation:

```sql
select has_column('player_api', 'map_nodes', 'confidence_band', 'nodes expose qualitative confidence');
select has_column('player_api', 'map_routes', 'confidence_band', 'routes expose qualitative confidence');
select has_column('player_api', 'map_nodes', 'source_kind', 'nodes expose source category');
select has_column('player_api', 'map_nodes', 'source_label', 'nodes may expose a safe known source label');
select has_column('player_api', 'map_nodes', 'freshness', 'nodes expose narrative freshness');
select has_column('player_api', 'map_nodes', 'privacy', 'nodes expose descriptive privacy');
select hasnt_column('player_api', 'map_nodes', 'confidence', 'raw numeric confidence is not player-readable');
```

Add result assertions for the seed, including:

```sql
select results_eq(
  $$select confidence_band, source_kind, source_label, freshness, privacy
    from player_api.map_nodes
    where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
      and projection_id = '91000000-0000-4000-8000-000000000002'::uuid$$,
  $$values ('low'::text, 'npc'::text, null::text, 'recent'::text, 'private'::text)$$,
  'unknown NPC rumor exposes category but not hidden identity'
);
```

With world minute 1440, refreshed 1380 and window 240, age 60 is `recent`.

- [ ] **Step 2: Run database test and confirm RED**

```bash
pnpm db:reset
pnpm supabase test db supabase/tests/database/player_knowledge_metadata.test.sql
```

Expected: FAIL on missing player-safe columns/raw confidence still present.

- [ ] **Step 3: Add constrained player-safe columns and backfill existing rows**

In the migration, add nullable columns first to both `player_api.map_nodes` and `player_api.map_routes`:

```sql
confidence_band text,
source_kind text,
source_label text,
freshness text,
privacy text
```

Backfill node rows by joining `world_private.player_location_knowledge -> world_private.locations -> world_private.worlds` on owner/projection. Derive:

```sql
confidence_band = server_api.player_confidence_band_v1(k.confidence)
source_kind = k.origin_kind
source_label = case when k.origin_label_known then btrim(k.origin_label) else null end
freshness = server_api.player_freshness_v1(w.current_world_minute, k.refreshed_world_minute, k.freshness_window_minutes)
privacy = k.privacy
```

Backfill route rows by joining route knowledge and canonical route only inside trusted SQL to obtain `world_id`; no canonical ID is added to `player_api`.

Add a `do $$ begin if exists (...) then raise exception ... end if; end $$;` guard if any of the five required safe columns remain null after backfill.

Then set required columns `not null` except `source_label`, add exact allow-list CHECK constraints and enforce `source_label is null or (source_label = btrim(source_label) and char_length(source_label) between 1 and 120)`.

Finally:

```sql
alter table player_api.map_nodes drop column confidence;
```

- [ ] **Step 4: Add safe node metadata materialization for future inserts/updates**

Create a trusted helper that updates an existing node projection using owner + projection ID:

```sql
create function server_api.refresh_player_node_knowledge_metadata_v1(
  p_owner_user_id uuid,
  p_projection_id uuid
)
returns void
```

Its single UPDATE must derive the five safe fields from `player_location_knowledge`, `locations` and `worlds` and never copy `source_location_id` or private geometry/payload.

Add an `after insert or update of confidence,origin_kind,origin_label,origin_label_known,refreshed_world_minute,freshness_window_minutes,privacy` trigger on `world_private.player_location_knowledge` that calls the helper. Revoke trigger/helper execution from browser roles; grant helper execution only to service role.

Because trusted seed/system code can still insert the authorized geometry row after private knowledge already exists, add a `before insert` trigger on `player_api.map_nodes` that fills the five semantic fields from the matching private row. Raise `player_node_knowledge_not_found` if the owner/projection mapping does not exist. Do not alter role/geom/label/details in this trigger.

- [ ] **Step 5: Replace only the route materializer body, preserving 8D geometry policy**

Use `create or replace function server_api.refresh_player_route_projection_v1(uuid,uuid)` in the new migration. Keep the existing 8D branches for endpoint lookup, missing endpoint suppression and `v_public_geom` exactly equivalent. Add only:

```text
world lookup for v_route.world_id
confidence_band from v_knowledge.confidence
source_kind from v_knowledge.origin_kind
source_label only when v_knowledge.origin_label_known
freshness from current_world_minute/refreshed_world_minute/window
privacy from v_knowledge.privacy
```

Include the five safe columns in both INSERT and ON CONFLICT UPDATE. Existing route triggers continue calling the same function name and signature.

- [ ] **Step 6: Recalculate freshness atomically when world time advances**

Add `world_private.refresh_player_freshness_for_world_v1()` as an `after update of current_world_minute` trigger on `world_private.worlds`.

Its node update joins only trusted private mappings and sets only `player_api.map_nodes.freshness`. Its route update does the equivalent for `player_api.map_routes.freshness`. It must not modify confidence/source/privacy/knowledge state/geometry/details.

Add pgTAP proof:

```sql
update world_private.worlds
set current_world_minute = 1560
where id = '10000000-0000-4000-8000-000000000001'::uuid;

select results_eq(
  $$select freshness from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('stale'::text)$$,
  'advancing narrative time atomically refreshes route freshness'
);
```

Then prove regression fails and does not persist:

```sql
select throws_ok(
  $$update world_private.worlds
    set current_world_minute = 1200
    where id = '10000000-0000-4000-8000-000000000001'::uuid$$,
  '22023',
  'world_minute_regression',
  'narrative time cannot regress'
);
```

- [ ] **Step 7: Extend RLS/route regressions**

In `rls.test.sql`, under player A and player B authenticated contexts, assert each sees only their own semantic metadata and cannot INSERT/UPDATE either projection table.

In `player_route_knowledge.test.sql`, leave every geometry assertion intact. Add at least one assertion that changing route confidence/source/freshness metadata does not alter the expected WKT path.

- [ ] **Step 8: Regenerate database types**

```bash
pnpm db:reset
pnpm db:types > supabase/database.types.ts
pnpm prettier --write supabase/database.types.ts
```

Then confirm the generated `player_api.map_nodes` row type has no `confidence` and both node/route row types have the five safe columns.

- [ ] **Step 9: Run complete database suites**

```bash
pnpm db:test
```

Expected: all pgTAP suites green, including unchanged route precision tests.

- [ ] **Step 10: Commit Task 2**

```bash
git add supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql supabase/tests/database/player_knowledge_metadata.test.sql supabase/tests/database/player_route_knowledge.test.sql supabase/tests/database/rls.test.sql supabase/seed.sql supabase/database.types.ts
git commit -m "feat: materialize safe player knowledge metadata"
```

---

### Task 3: Replace raw projection confidence with the common typed envelope

**Files:**
- Create: `packages/map-renderer/src/knowledge-presentation.ts`
- Modify: `packages/map-renderer/src/index.ts`
- Modify: `packages/map-renderer/src/projection.ts`
- Modify: `packages/map-renderer/src/player-projection.ts`
- Modify: `packages/map-renderer/src/player-projection.test.ts`
- Modify: `packages/map-renderer/src/projection-safety.test.ts`
- Modify: `packages/map-renderer/src/projection-route-safety.test.ts`

**Interfaces:**
- Produces `ProjectionKnowledgePresentation` and its exact value unions.
- `ProjectionNode.knowledgePresentation` and `ProjectionRoute.knowledgePresentation` become required for Player-built nodes/routes.
- `PlayerProjectionNodeInput`/`PlayerProjectionRouteInput` consume the envelope; node numeric confidence is removed.
- Consumed by world-schema, adapter and UI.

- [ ] **Step 1: Write RED builder tests for a shared node/route envelope**

Add one fixture constant:

```ts
const knowledgePresentation = {
  confidence: 'high',
  source: { kind: 'npc', label: 'Mestre Han' },
  freshness: 'recent',
  privacy: 'private',
} as const;
```

Add tests asserting `buildPlayerMapProjection` copies this exact shape onto both a node and route. Add:

```ts
expect(JSON.stringify(projection)).not.toMatch(/"confidence"\s*:\s*0\./);
```

and remove numeric `confidence` from node input fixtures.

- [ ] **Step 2: Run focused renderer tests and confirm RED/type failure**

```bash
pnpm vitest run packages/map-renderer/src/player-projection.test.ts
```

Expected: compile/test failure because the common contract does not exist and node input still expects numeric confidence.

- [ ] **Step 3: Create the common presentation contract**

Create `knowledge-presentation.ts`:

```ts
export const PROJECTION_CONFIDENCE_BANDS = ['low', 'moderate', 'high', 'very-high'] as const;
export type ProjectionConfidenceBand = (typeof PROJECTION_CONFIDENCE_BANDS)[number];

export const PROJECTION_KNOWLEDGE_SOURCE_KINDS = [
  'system', 'exploration', 'npc', 'player', 'document', 'scene',
] as const;
export type ProjectionKnowledgeSourceKind = (typeof PROJECTION_KNOWLEDGE_SOURCE_KINDS)[number];

export const PROJECTION_FRESHNESS_VALUES = [
  'just-updated', 'recent', 'aging', 'stale', 'not-applicable',
] as const;
export type ProjectionFreshness = (typeof PROJECTION_FRESHNESS_VALUES)[number];

export const PROJECTION_KNOWLEDGE_PRIVACY_VALUES = ['private', 'shared', 'public'] as const;
export type ProjectionKnowledgePrivacy = (typeof PROJECTION_KNOWLEDGE_PRIVACY_VALUES)[number];

export const PLAYER_KNOWLEDGE_SOURCE_LABEL_MAX_LENGTH = 120;

export interface ProjectionKnowledgeSource {
  kind: ProjectionKnowledgeSourceKind;
  label?: string;
}

export interface ProjectionKnowledgePresentation {
  confidence: ProjectionConfidenceBand;
  source: ProjectionKnowledgeSource;
  freshness: ProjectionFreshness;
  privacy: ProjectionKnowledgePrivacy;
}
```

Export it from `packages/map-renderer/src/index.ts`.

- [ ] **Step 4: Update projection/build types minimally**

In `projection.ts`, remove `confidence?: number` from `ProjectionNode` and add required `knowledgePresentation: ProjectionKnowledgePresentation` to `ProjectionNode` and `ProjectionRoute`.

In `player-projection.ts`, replace `PlayerProjectionNodeInput.confidence` with `knowledgePresentation`; add the same required property to `PlayerProjectionRouteInput`; copy it unchanged into both returned projection items.

Do not add the envelope to areas/rings/annotations in 8F.

- [ ] **Step 5: Add anti-leak and route precision regressions**

In `projection-safety.test.ts`, pass malicious unknown objects beneath `knowledgePresentation.source` carrying each of:

```ts
['sourceLocationId', 'sourceRouteId', 'canonicalId', 'worldId', 'ownerUserId', 'secretPayload']
```

Assert `assertPlayerProjectionSafe` still throws.

In `projection-route-safety.test.ts`, add a valid envelope to route fixtures and prove the route path points are unchanged.

- [ ] **Step 6: Run focused renderer suites GREEN**

```bash
pnpm vitest run packages/map-renderer/src/player-projection.test.ts packages/map-renderer/src/projection-safety.test.ts packages/map-renderer/src/projection-route-safety.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/map-renderer/src/knowledge-presentation.ts packages/map-renderer/src/index.ts packages/map-renderer/src/projection.ts packages/map-renderer/src/player-projection.ts packages/map-renderer/src/player-projection.test.ts packages/map-renderer/src/projection-safety.test.ts packages/map-renderer/src/projection-route-safety.test.ts
git commit -m "feat: add typed player knowledge presentation"
```

---

### Task 4: Enforce the semantic envelope at schema and DB-adapter boundaries

**Files:**
- Modify: `packages/world-schema/src/schemas.ts`
- Modify: `packages/world-schema/src/schemas.test.ts`
- Modify: `apps/player/lib/map/player-projection-source.ts`
- Modify: `apps/player/lib/map/player-projection-source.test.ts`

**Interfaces:**
- Produces strict `knowledgePresentation` parsing for node/route projections.
- Produces `readKnowledgePresentation(row)` in the Player DB adapter from five safe columns only.
- Browser/server presentation path never sees raw numeric confidence or narrative minute coordinates.

- [ ] **Step 1: Add RED strict world-schema tests**

Create a reusable valid envelope and assert both node and route parse successfully. Add invalid cases for:

```text
confidence = "0.95"
confidence = "certain"
source.kind = "npc-rumor"
source.label = whitespace-only
source.label length 121
source object with sourceRef/sourceId/canonicalId
freshness = "old"
privacy = "friends"
unknown top-level envelope key
legacy numeric node confidence field
missing envelope on player node or player route
```

- [ ] **Step 2: Run schema tests and confirm RED**

```bash
pnpm vitest run packages/world-schema/src/schemas.test.ts
```

Expected: FAIL because current projection schema still allows legacy node confidence and has no common envelope.

- [ ] **Step 3: Implement strict Zod presentation schemas**

Import the runtime arrays/max constant from `@murim/map-renderer`. Add:

```ts
const projectionKnowledgeSourceSchema = z.object({
  kind: z.enum(PROJECTION_KNOWLEDGE_SOURCE_KINDS),
  label: z.string().trim().min(1).max(PLAYER_KNOWLEDGE_SOURCE_LABEL_MAX_LENGTH).optional(),
}).strict();

const projectionKnowledgePresentationSchema = z.object({
  confidence: z.enum(PROJECTION_CONFIDENCE_BANDS),
  source: projectionKnowledgeSourceSchema,
  freshness: z.enum(PROJECTION_FRESHNESS_VALUES),
  privacy: z.enum(PROJECTION_KNOWLEDGE_PRIVACY_VALUES),
}).strict();
```

Require `knowledgePresentation` on projection nodes/routes and remove numeric projection `confidence` from node schema. Keep all other `.strict()` behavior.

- [ ] **Step 4: Rewrite Player adapter fixtures to the five safe columns**

In `player-projection-source.test.ts`, replace default node `confidence: 0.95` with:

```ts
confidence_band: 'very-high',
source_kind: 'exploration',
source_label: 'Chegada própria',
freshness: 'not-applicable',
privacy: 'private',
```

Give route rows equivalent semantic fields. Remove any assumption that route `details` are used for knowledge metadata.

- [ ] **Step 5: Add RED adapter tests**

Assert node and route SELECT strings contain all five safe column names and do **not** contain `confidence`, `current_world_minute`, `refreshed_world_minute`, `learned_world_minute`, `source_location_id` or `source_route_id`.

Add `it.each` invalid rows for each unknown enum. Add source-label cases for `null` accepted/omitted, trimmed string accepted, whitespace-only rejected, >120 rejected, non-string rejected.

Assert serialized projection contains no numeric confidence and no raw narrative minute.

- [ ] **Step 6: Run adapter test and confirm RED**

```bash
pnpm vitest run apps/player/lib/map/player-projection-source.test.ts
```

Expected: FAIL because current adapter selects/requires raw `confidence` on nodes and does not read route metadata.

- [ ] **Step 7: Implement one strict row-to-envelope parser**

In `player-projection-source.ts`, import all semantic arrays/types/max length. Add exact membership helpers and:

```ts
function readKnowledgePresentation(row: Record<string, unknown>): ProjectionKnowledgePresentation
```

Rules:

```text
confidence_band must be one of four values
source_kind must be one of six values
source_label may be null; otherwise string -> trim -> length 1..120
freshness must be one of five values
privacy must be one of three values
```

Return:

```ts
{
  confidence: row.confidence_band,
  source: {
    kind: row.source_kind,
    ...(sourceLabel === undefined ? {} : { label: sourceLabel }),
  },
  freshness: row.freshness,
  privacy: row.privacy,
}
```

Update node and route SELECT columns to safe semantic columns and pass the parsed envelope into `PlayerProjectionNodeInput`/`PlayerProjectionRouteInput`. Delete all raw numeric confidence validation/copy from `parseNode`.

Do not read `world_private` and do not compute confidence/freshness here.

- [ ] **Step 8: Run schema + adapter suites GREEN**

```bash
pnpm vitest run packages/world-schema/src/schemas.test.ts apps/player/lib/map/player-projection-source.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add packages/world-schema/src/schemas.ts packages/world-schema/src/schemas.test.ts apps/player/lib/map/player-projection-source.ts apps/player/lib/map/player-projection-source.test.ts
git commit -m "feat: enforce player knowledge metadata boundary"
```

---

### Task 5: Present metadata in the existing compact node experience

**Files:**
- Modify: `apps/player/lib/map/player-node-detail-model.ts`
- Modify: `apps/player/lib/map/player-node-detail-model.test.ts`
- Modify: `apps/player/app/player-map-explorer.tsx`
- Modify: `apps/player/app/player-map-explorer.test.tsx`
- Modify: `apps/player/app/player-map-svg.tsx`
- Modify: `apps/player/app/player-map-svg.test.tsx`
- Modify: `apps/player/app/player-map-styles.test.ts`
- Modify: `apps/player/app/globals.css`

**Interfaces:**
- `PlayerNodeDetailView` gains a geometry-free copied `knowledgePresentation`.
- Produces centralized formatters for confidence/source/freshness/privacy.
- SVG exposes only semantic confidence/freshness hooks; source/privacy stay in detail panel.

- [ ] **Step 1: Add RED detail-model tests for minimization and copy**

Assert `buildPlayerNodeDetailViews` copies `knowledgePresentation` but still omits position, approximateLocation, routes and any DB/canonical fields.

Add formatter expectations:

```ts
expect(formatPlayerConfidence('low')).toBe('Baixa');
expect(formatPlayerConfidence('moderate')).toBe('Moderada');
expect(formatPlayerConfidence('high')).toBe('Alta');
expect(formatPlayerConfidence('very-high')).toBe('Muito alta');

expect(formatPlayerFreshness('just-updated')).toBe('Atualizada agora');
expect(formatPlayerFreshness('recent')).toBe('Recente');
expect(formatPlayerFreshness('aging')).toBe('Envelhecendo');
expect(formatPlayerFreshness('stale')).toBe('Desatualizada');
expect(formatPlayerFreshness('not-applicable')).toBe('Frescor não aplicável');

expect(formatPlayerPrivacy('private')).toBe('Privada');
expect(formatPlayerPrivacy('shared')).toBe('Compartilhada');
expect(formatPlayerPrivacy('public')).toBe('Pública');
```

Source formatting must prefer known label and otherwise use centralized category copy:

```text
system -> Sistema
exploration -> Exploração própria
npc -> NPC
player -> Outro jogador
document -> Documento
scene -> Cena
```

- [ ] **Step 2: Run detail-model tests and confirm RED**

```bash
pnpm vitest run apps/player/lib/map/player-node-detail-model.test.ts
```

Expected: FAIL on missing metadata view/formatters.

- [ ] **Step 3: Implement geometry-free copy and formatters**

Extend `PlayerNodeDetailView` with:

```ts
knowledgePresentation: ProjectionKnowledgePresentation;
```

Copy the envelope field-by-field, not by passing the entire projection node object. Add exhaustive switch formatters for confidence, freshness, privacy and source category.

- [ ] **Step 4: Add RED explorer panel tests**

Extend the existing jsdom interaction fixture with safe metadata and assert selecting a node renders exactly:

```text
Confiança
Alta
Fonte
Mestre Han
Frescor
Recente
Privacidade
Privada
```

Add a second fixture with `{ source: { kind: 'npc' } }` and assert `NPC` appears without a fabricated identity.

Keep the existing network-spy assertion proving click/Enter/Space selection performs zero fetch/XHR calls.

- [ ] **Step 5: Render a compact definition-list-style metadata block**

In `player-map-explorer.tsx`, within the existing detail body and without creating a new interaction surface, render:

```tsx
<dl className="player-node-knowledge-meta">
  <div><dt>Confiança</dt><dd>{formatPlayerConfidence(...)} </dd></div>
  <div><dt>Fonte</dt><dd>{formatPlayerSource(...)} </dd></div>
  <div><dt>Frescor</dt><dd>{formatPlayerFreshness(...)} </dd></div>
  <div><dt>Privacidade</dt><dd>{formatPlayerPrivacy(...)} </dd></div>
</dl>
```

Do not render percentages, IDs, raw minute counts or timestamps.

- [ ] **Step 6: Add semantic SVG hooks without changing geometry**

In `player-map-svg.tsx`, add to node group/marker presentation:

```tsx
data-node-confidence={node.knowledgePresentation.confidence}
data-node-freshness={node.knowledgePresentation.freshness}
```

Add route equivalents on `<polyline>`:

```tsx
data-route-confidence={route.knowledgePresentation.confidence}
data-route-freshness={route.knowledgePresentation.freshness}
```

Do not add `source`, `privacy`, source label, raw confidence or world minute to SVG attributes.

- [ ] **Step 7: Prove hooks do not alter path/radius/visibility**

Update `player-map-svg.test.tsx` fixtures to include required envelopes. Assert semantic attributes exist, existing `points="10,20 25,5 40,50"` remains exact, ghost radius stays the supplied value and no source label/privacy appears in map markup.

In `player-map-styles.test.ts`, assert CSS has selectors only for semantic confidence/freshness presentation and no selector that changes `display`, `visibility`, geometry/radius or route points based on those fields.

- [ ] **Step 8: Add restrained CSS**

Add compact metadata layout:

```css
.player-node-knowledge-meta {
  display: grid;
  gap: 0.35rem;
  margin: 0;
}

.player-node-knowledge-meta > div {
  display: grid;
  grid-template-columns: minmax(5.5rem, auto) 1fr;
  gap: 0.75rem;
}

.player-node-knowledge-meta dt,
.player-node-knowledge-meta dd {
  margin: 0;
}
```

Confidence/freshness map styling may only adjust subtle opacity/dash presentation already authorized; do not create permanent badges or new text per node.

- [ ] **Step 9: Run all Player presentation suites GREEN**

```bash
pnpm vitest run apps/player/lib/map/player-node-detail-model.test.ts apps/player/app/player-map-explorer.test.tsx apps/player/app/player-map-svg.test.tsx apps/player/app/player-map-styles.test.ts
```

Expected: PASS, including all 8E focus/keyboard/close behavior.

- [ ] **Step 10: Commit Task 5**

```bash
git add apps/player/lib/map/player-node-detail-model.ts apps/player/lib/map/player-node-detail-model.test.ts apps/player/app/player-map-explorer.tsx apps/player/app/player-map-explorer.test.tsx apps/player/app/player-map-svg.tsx apps/player/app/player-map-svg.test.tsx apps/player/app/player-map-styles.test.ts apps/player/app/globals.css
git commit -m "feat: present player knowledge metadata"
```

---

### Task 6: Prove end-to-end isolation and run CI-equivalent verification

**Files:**
- Modify: `scripts/database-api-leakage-test.mjs`
- Modify: `scripts/player-auth-projection-test.mjs`
- Modify: `apps/player/app/api/map-projection/route.test.ts` only if its projection fixture requires the now-mandatory envelope.
- Modify: any compile-only test fixtures that instantiate Player nodes/routes without `knowledgePresentation`.

**Interfaces:**
- Produces integration evidence that PostgREST and real Auth expose only safe semantic metadata to the correct player.
- Confirms raw confidence, private source identity, narrative minute fields and canonical IDs are unrecoverable from the Player surfaces.

- [ ] **Step 1: Add RED PostgREST assertions**

For player A and B rows, assert the API returns `confidence_band`, `source_kind`, optional `source_label`, `freshness`, `privacy` and does not contain any of:

```text
confidence
current_world_minute
learned_world_minute
refreshed_world_minute
freshness_window_minutes
origin_label_known
source_location_id
source_route_id
world_id
```

Assert the player A unknown NPC rumor has `source_label === null`, while a deliberately known source fixture exposes only its safe display label.

- [ ] **Step 2: Add equivalent real-Auth projection assertions**

In `player-auth-projection-test.mjs`, after obtaining each real session, verify the serialized `/api/map-projection` envelope contains qualitative confidence and the expected safe source/freshness/privacy values, and does not contain raw numeric confidence or narrative-minute/private field names.

Keep all existing A/B different-map assertions.

- [ ] **Step 3: Run focused integration checks**

With local Supabase running and reset:

```bash
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

Expected: both green.

- [ ] **Step 4: Run the full unit/build quality gate**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all green. If compile failures are only fixtures missing required `knowledgePresentation`, update those fixtures with the same minimal safe envelope rather than making the field optional.

- [ ] **Step 5: Run the complete database gate from a clean reset**

```bash
pnpm db:reset
pnpm db:test
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

Expected: all green.

- [ ] **Step 6: Verify generated DB types have zero drift**

```bash
pnpm db:types > supabase/database.types.generated.ts
pnpm prettier --write supabase/database.types.generated.ts
diff -u supabase/database.types.ts supabase/database.types.generated.ts
rm supabase/database.types.generated.ts
```

Expected: empty diff.

- [ ] **Step 7: Search the Player-facing code and API contract for forbidden raw fields**

Run:

```bash
rg -n "current_world_minute|learned_world_minute|refreshed_world_minute|freshness_window_minutes|origin_label_known|source_location_id|source_route_id" apps/player packages/map-renderer packages/world-schema
rg -n "confidence" apps/player/lib/map packages/map-renderer/src packages/world-schema/src
```

Expected: no private time/ID fields in Player/projection code; `confidence` occurrences are semantic names such as `confidence_band`, `ProjectionConfidenceBand` or `knowledgePresentation.confidence`, not numeric Player confidence.

- [ ] **Step 8: Commit Task 6**

```bash
git add scripts/database-api-leakage-test.mjs scripts/player-auth-projection-test.mjs apps/player packages/map-renderer packages/world-schema supabase/database.types.ts
git commit -m "test: prove player knowledge metadata isolation"
```

---

### Task 7: Close 8F with status evidence and draft PR

**Files:**
- Create: `docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`
- Google Drive after functional CI: `00_MASTER_CONTROL`, `04_BOOTSTRAP_CHECKLIST`, architecture decisions only if the final implementation introduces a decision not already captured by the approved 8F spec.

**Interfaces:**
- Produces the canonical Git checkpoint and evidence trail for 8F.
- Does not merge or deploy.

- [ ] **Step 1: Push the functional branch head and inspect GitHub CI**

Push/commit writes happen through the repository workflow already used for prior cuts. Confirm the branch CI runs both `quality` and `database` and both are green before calling the functional implementation complete.

Record the exact functional head SHA and GitHub Actions run ID.

- [ ] **Step 2: Write `docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md` from actual evidence**

The status document must record:

```text
Base 8E SHA: c4a6a90bfeffd5c20d3608f27bc52423e8291563
8F branch: foundation/player-knowledge-metadata-v0
Functional head: <actual SHA from Step 1>
CI run: <actual run ID from Step 1>
```

Then summarize only verified behavior: qualitative confidence, safe source identity rule, world-minute freshness, descriptive privacy, node+route common envelope, raw confidence removal, atomic freshness refresh, A/B isolation, unchanged 8D route precision and unchanged 8E local selection.

Do not claim Playwright/device QA, sharing actions, notes, calendar or deploy.

- [ ] **Step 3: Update `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`**

Add 8F as closed only after the functional CI from Step 1 is green. Keep Gate 8 open and list the remaining slices: private notes, controlled sharing and mobile/touch closure.

- [ ] **Step 4: Commit documentation and re-run CI**

```bash
git add docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: close player knowledge metadata 8F"
```

Record the final documentation head and confirm CI stays green.

- [ ] **Step 5: Open a draft PR against the exact 8E branch**

Create a **DRAFT** PR:

```text
Title: Foundation V0 — Player Knowledge Metadata 8F
Base: foundation/player-node-details-v0
Head: foundation/player-knowledge-metadata-v0
```

PR body must include scope, security boundary, migration summary, narrative-time distinction from full clocks, test/CI evidence, exclusions and “UNMERGED / NO DEPLOY”.

- [ ] **Step 6: Update Drive canonical status only from verified Git evidence**

After final GitHub CI is green, update the Drive checklist line:

```text
[ ] Implementar confiança, origem, frescor e privacidade.
```

to checked, append the 8F evidence, and change Gate 8 progress text to include `8F VERDE` while leaving Gate 8 itself open.

Update Master progress wording consistently. Do not mark notes, sharing or mobile/touch complete.

- [ ] **Step 7: Final closure verification**

Verify the final state is all of:

```text
8F branch exists and is based on 8E
spec + implementation plan committed
functional CI green
final documentation CI green
PR draft/open/unmerged
Drive checklist/master aligned
no merge
a no deploy
Gate 8 still open
```

Only then report 8F as closed.
