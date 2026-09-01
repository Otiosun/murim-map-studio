# Player Knowledge Metadata 8F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw player-facing knowledge precision with a reusable, strictly typed confidence/source/freshness/privacy presentation envelope for nodes and routes, backed by narrative world time and preserved anti-leak guarantees.

**Architecture:** Raw confidence, source context and narrative-time coordinates remain private in `world_private`. Trusted database materialization converts them into five constrained player-safe columns in `player_api`; the Player adapter parses those values into one common `ProjectionKnowledgePresentation`, and the existing node detail panel formats that already-authorized envelope without new requests. Advancing the private monotonic world-minute coordinate recalculates only materialized freshness in the same database transaction; no autonomous clock/calendar system is introduced.

**Tech Stack:** Next.js 16.3.3, React 19.2.x, TypeScript 6.0.2, Zod 4.4.3, Vitest 4.1.11, jsdom 30.0.1, Supabase CLI 2.115.0, PostgreSQL/PostGIS, pgTAP, pnpm 11.21.0.

**Spec:** `docs/superpowers/specs/2026-09-01-player-knowledge-metadata-design.md`

## Global Constraints

- Base is Gate 8E final head `c4a6a90bfeffd5c20d3608f27bc52423e8291563` from `foundation/player-node-details-v0`.
- Work only on `foundation/player-knowledge-metadata-v0`; do not merge or deploy.
- `MapProjection` remains the anti-leak presentation boundary.
- Browser/request identity never selects `playerId`; authenticated server-side session remains authoritative.
- No browser Supabase client, service-role credential, `world_private` query/import, canonical/source lookup, server action or selection-time network request enters `apps/player`.
- Raw numeric confidence remains private and disappears from player-readable `player_api` plus serialized Player `MapProjection`.
- Confidence bands are exactly `low | moderate | high | very-high` for `[0,.40)`, `[.40,.70)`, `[.70,.90)`, `[.90,1]`.
- Source kinds are exactly `system | exploration | npc | player | document | scene`.
- `origin_label` becomes player-visible only when private state explicitly marks that source identity known to the character.
- Safe source labels are trimmed plain text, non-empty when present, maximum 120 Unicode code points. IDs are never used as fallback labels.
- Freshness is exactly `just-updated | recent | aging | stale | not-applicable` and derives only from world minutes.
- `learned_at`, `refreshed_at`, JavaScript `Date`, request time and wall-clock time never determine narrative freshness.
- World minutes are non-negative integers; `current_world_minute` cannot regress.
- `learned_world_minute <= refreshed_world_minute <= current_world_minute` is required when materializing a projection.
- Missing `freshness_window_minutes` maps to `not-applicable`; present windows are positive integers.
- Privacy is exactly `private | shared | public`; it is presentation metadata, never an ACL.
- None of the four dimensions changes `knowledgeState`, node geometry, ghost radius, route precision, item authorization or RLS.
- 8D route precision and 8E local selection behavior remain intact.
- Full calendars, time-of-day, autonomous ticking, faction clocks, notes, actual sharing actions, route detail UI and Phase-10 Playwright/device coverage stay outside 8F.
- All DB changes are migrations; player roles remain SELECT-only on their own `player_api` rows.

---

## File Map

### Create

- `supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql` — world-minute primitive, private knowledge metadata, safe materialization and projection columns.
- `supabase/tests/database/player_knowledge_metadata.test.sql` — pgTAP for thresholds, source identity, freshness, privacy, monotonicity and raw-confidence removal.
- `packages/map-renderer/src/knowledge-presentation.ts` — common semantic constants/types.
- `docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md` — verified 8F closure evidence.

### Modify

- `supabase/seed.sql`
- `supabase/tests/database/player_route_knowledge.test.sql`
- `supabase/tests/database/rls.test.sql`
- `supabase/database.types.ts`
- `scripts/database-api-leakage-test.mjs`
- `scripts/player-auth-projection-test.mjs`
- `packages/map-renderer/src/index.ts`
- `packages/map-renderer/src/projection.ts`
- `packages/map-renderer/src/player-projection.ts`
- `packages/map-renderer/src/player-projection.test.ts`
- `packages/map-renderer/src/projection-safety.test.ts`
- `packages/map-renderer/src/projection-route-safety.test.ts`
- `packages/world-schema/src/schemas.ts`
- `packages/world-schema/src/schemas.test.ts`
- `apps/player/lib/map/player-projection-source.ts`
- `apps/player/lib/map/player-projection-source.test.ts`
- `apps/player/lib/map/player-node-detail-model.ts`
- `apps/player/lib/map/player-node-detail-model.test.ts`
- `apps/player/app/player-map-explorer.tsx`
- `apps/player/app/player-map-explorer.test.tsx`
- `apps/player/app/player-map-svg.tsx`
- `apps/player/app/player-map-svg.test.tsx`
- `apps/player/app/player-map-styles.test.ts`
- `apps/player/app/globals.css`
- `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`

The existing `20260831062000_player_route_knowledge_v0.sql` is not edited; the new migration uses `create or replace` for its route materializer.

---

### Task 1: Add narrative-time and private metadata primitives

**Files:**
- Create: `supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql`
- Create: `supabase/tests/database/player_knowledge_metadata.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Produces `current_world_minute` on worlds.
- Produces `origin_label_known`, `learned_world_minute`, `refreshed_world_minute`, `freshness_window_minutes`, `privacy` on both private knowledge tables.
- Produces `server_api.player_confidence_band_v1(numeric)` and `server_api.player_freshness_v1(bigint,bigint,bigint)`.

- [ ] **Step 1: Write the initial RED pgTAP test**

Create the file with 18 assertions:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(18);

select has_column('world_private','worlds','current_world_minute','world has narrative minute');
select has_column('world_private','player_location_knowledge','refreshed_world_minute','location knowledge has narrative refresh minute');
select has_column('world_private','player_route_knowledge','refreshed_world_minute','route knowledge has narrative refresh minute');
select has_column('world_private','player_location_knowledge','origin_label_known','location source identity has explicit known flag');
select has_column('world_private','player_route_knowledge','origin_label_known','route source identity has explicit known flag');
select has_column('world_private','player_location_knowledge','freshness_window_minutes','location knowledge can opt into staleness');
select has_column('world_private','player_route_knowledge','privacy','route knowledge has privacy metadata');

select is(server_api.player_confidence_band_v1(0.3999),'low'::text,'0.3999 is low');
select is(server_api.player_confidence_band_v1(0.4000),'moderate'::text,'0.4 is moderate');
select is(server_api.player_confidence_band_v1(0.7000),'high'::text,'0.7 is high');
select is(server_api.player_confidence_band_v1(0.9000),'very-high'::text,'0.9 is very high');

select is(server_api.player_freshness_v1(100,100,60),'just-updated'::text,'age zero is just updated');
select is(server_api.player_freshness_v1(129,100,60),'recent'::text,'first half is recent');
select is(server_api.player_freshness_v1(130,100,60),'aging'::text,'half window is aging');
select is(server_api.player_freshness_v1(160,100,60),'stale'::text,'full window is stale');
select is(server_api.player_freshness_v1(500,100,null),'not-applicable'::text,'no window means not applicable');
select ok(not has_function_privilege('authenticated','server_api.player_confidence_band_v1(numeric)','EXECUTE'),'authenticated cannot invoke confidence helper');
select ok(has_function_privilege('service_role','server_api.player_confidence_band_v1(numeric)','EXECUTE'),'service role can invoke confidence helper');

select * from finish();
rollback;
```

- [ ] **Step 2: Run RED**

```bash
pnpm db:start
pnpm db:reset
pnpm supabase test db supabase/tests/database/player_knowledge_metadata.test.sql
```

Expected: missing fields/functions fail.

- [ ] **Step 3: Add schema fields and constraints**

Add:

```sql
alter table world_private.worlds
  add column current_world_minute bigint not null default 0
  check (current_world_minute >= 0);
```

Add to both private knowledge tables:

```text
origin_label_known boolean not null default false
learned_world_minute bigint not null default 0
refreshed_world_minute bigint not null default 0
freshness_window_minutes bigint null
privacy text not null default 'private'
```

Add checks for non-negative minutes, `learned_world_minute <= refreshed_world_minute`, positive optional window, and privacy allow-list.

Before source-kind CHECKs, normalize existing values:

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
  else origin_kind end;
update world_private.player_route_knowledge
set origin_kind = case origin_kind
  when 'personal-exploration' then 'exploration'
  when 'npc-rumor' then 'npc'
  when 'shared-map' then 'player'
  else origin_kind end;
```

Fail the migration if any origin kind remains outside the six allowed values, then add the CHECKs.

For known source labels use a constraint equivalent to:

```sql
check (
  not origin_label_known
  or (
    origin_label is not null
    and origin_label = btrim(origin_label)
    and char_length(origin_label) between 1 and 120
  )
)
```

- [ ] **Step 4: Add deterministic server-only classifiers**

```sql
create function server_api.player_confidence_band_v1(p_confidence numeric)
returns text
language plpgsql immutable security definer
set search_path = pg_catalog
as $$
begin
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception using errcode='22023', message='invalid_player_confidence';
  end if;
  if p_confidence < 0.40 then return 'low'; end if;
  if p_confidence < 0.70 then return 'moderate'; end if;
  if p_confidence < 0.90 then return 'high'; end if;
  return 'very-high';
end;
$$;
```

```sql
create function server_api.player_freshness_v1(
  p_current_world_minute bigint,
  p_refreshed_world_minute bigint,
  p_window_minutes bigint
)
returns text
language plpgsql immutable security definer
set search_path = pg_catalog
as $$
declare v_age bigint;
begin
  if p_current_world_minute < 0 or p_refreshed_world_minute < 0 then
    raise exception using errcode='22023', message='invalid_world_minute';
  end if;
  if p_refreshed_world_minute > p_current_world_minute then
    raise exception using errcode='22023', message='future_knowledge_world_minute';
  end if;
  if p_window_minutes is null then return 'not-applicable'; end if;
  if p_window_minutes <= 0 then
    raise exception using errcode='22023', message='invalid_freshness_window';
  end if;
  v_age := p_current_world_minute - p_refreshed_world_minute;
  if v_age = 0 then return 'just-updated'; end if;
  if v_age * 2 < p_window_minutes then return 'recent'; end if;
  if v_age < p_window_minutes then return 'aging'; end if;
  return 'stale';
end;
$$;
```

Revoke from `public, anon, authenticated`; grant execute to `service_role` only.

- [ ] **Step 5: Enforce monotonic world time**

Add `world_private.guard_world_minute_monotonic_v1()` as a `before update of current_world_minute` trigger. If `new.current_world_minute < old.current_world_minute`, raise SQLSTATE `22023` with message `world_minute_regression`.

- [ ] **Step 6: Update private seed fixtures**

Seed world minute `1440`. Use allowed source kinds and explicit source-known/privacy/time fields:

```text
A village: exploration, known “Chegada própria”, private, refreshed 1440, no window
A hidden rumor: npc, stored private label but known=false, private, refreshed 1380, window 240
B village: player, known “Contato confiável”, shared, refreshed 1320, window 480
B monastery: exploration, known “Investigação própria”, private, refreshed 1440, no window
A route: npc, known=false, private, refreshed 1380, window 180
B route: exploration, known “Investigação própria”, private, refreshed 1440, no window
```

Keep real timestamps as audit fields.

- [ ] **Step 7: Run GREEN and commit**

```bash
pnpm db:reset
pnpm supabase test db supabase/tests/database/player_knowledge_metadata.test.sql
git add supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql supabase/tests/database/player_knowledge_metadata.test.sql supabase/seed.sql
git commit -m "feat: add narrative knowledge metadata primitives"
```

---

### Task 2: Materialize only safe metadata into `player_api`

**Files:**
- Modify: `supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql`
- Modify: `supabase/tests/database/player_knowledge_metadata.test.sql`
- Modify: `supabase/tests/database/player_route_knowledge.test.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/database.types.ts`

**Interfaces:**
- Produces columns `confidence_band`, `source_kind`, `source_label`, `freshness`, `privacy` on node/route projection tables.
- Removes `player_api.map_nodes.confidence`.
- Produces safe node metadata refresh and atomic world-time freshness refresh.
- Replaces the route materializer body without changing 8D geometry policy.

- [ ] **Step 1: Extend pgTAP to final plan count 28 and make it RED**

Change `select plan(18)` to `select plan(28)` and add these seven schema assertions:

```sql
select has_column('player_api','map_nodes','confidence_band','nodes expose qualitative confidence');
select has_column('player_api','map_routes','confidence_band','routes expose qualitative confidence');
select has_column('player_api','map_nodes','source_kind','nodes expose source kind');
select has_column('player_api','map_nodes','source_label','nodes may expose known safe source');
select has_column('player_api','map_nodes','freshness','nodes expose freshness');
select has_column('player_api','map_nodes','privacy','nodes expose privacy');
select hasnt_column('player_api','map_nodes','confidence','raw numeric confidence is absent');
```

Add the seed semantic assertion:

```sql
select results_eq(
  $$select confidence_band,source_kind,source_label,freshness,privacy
    from player_api.map_nodes
    where owner_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
      and projection_id='91000000-0000-4000-8000-000000000002'::uuid$$,
  $$values ('low'::text,'npc'::text,null::text,'recent'::text,'private'::text)$$,
  'unknown NPC rumor exposes category but not hidden identity'
);
```

The final two assertions are added in Step 5 for atomic advancement/regression.

- [ ] **Step 2: Add constrained safe projection columns and backfill**

Add nullable `confidence_band, source_kind, source_label, freshness, privacy` text columns to both projection tables. Backfill nodes by joining private location knowledge to locations/worlds using owner+projection. Backfill routes by joining private route knowledge to routes/worlds inside trusted SQL.

Derive exactly:

```text
confidence_band = player_confidence_band_v1(private confidence)
source_kind = origin_kind
source_label = trimmed origin_label only when origin_label_known=true, otherwise NULL
freshness = player_freshness_v1(current_world_minute, refreshed_world_minute, freshness_window_minutes)
privacy = private privacy
```

Fail migration if any required safe column remains NULL. Then set all but `source_label` NOT NULL and add allow-list CHECKs. For `source_label`, require trimmed text with `char_length` 1..120 when non-null.

Drop `player_api.map_nodes.confidence` only after successful backfill.

- [ ] **Step 3: Add node materialization**

Create:

```text
server_api.refresh_player_node_knowledge_metadata_v1(owner uuid, projection uuid) returns void
```

It updates only the five safe semantic columns of an existing `player_api.map_nodes` row. Source label uses `origin_label_known`; it never copies canonical IDs, geometry or payloads.

Add an AFTER INSERT/UPDATE trigger on the seven private metadata inputs (`confidence`, `origin_kind`, `origin_label`, `origin_label_known`, `refreshed_world_minute`, `freshness_window_minutes`, `privacy`) to call this helper.

Add a BEFORE INSERT trigger on `player_api.map_nodes` that fills the five safe columns from the matching private knowledge row. If the owner/projection mapping does not exist, raise `player_node_knowledge_not_found`. Do not change authorized node geometry/role/label/details.

Edit the seed `player_api.map_nodes` INSERT to remove the dropped `confidence` column and its values. Do not hand-author the five safe columns in seed; let the BEFORE INSERT trigger derive them from private truth.

- [ ] **Step 4: Replace route materializer without changing geometry decisions**

In the new migration use:

```sql
create or replace function server_api.refresh_player_route_projection_v1(uuid, uuid)
```

Keep the existing endpoint lookup, suppression and `v_public_geom` logic semantically unchanged. Add only world lookup plus the five safe metadata values and write them in INSERT/ON CONFLICT UPDATE.

- [ ] **Step 5: Make world-minute advancement refresh freshness atomically**

Add an AFTER UPDATE OF `current_world_minute` trigger on `world_private.worlds`. It updates only `freshness` in matching player nodes/routes using private refresh minute/window. It must not touch state, confidence/source/privacy, details or geometry.

Add final two pgTAP assertions:

```sql
update world_private.worlds
set current_world_minute=1560
where id='10000000-0000-4000-8000-000000000001'::uuid;

select results_eq(
  $$select freshness from player_api.map_routes
    where projection_id='93000000-0000-4000-8000-000000000001'::uuid$$,
  $$values ('stale'::text)$$,
  'advancing narrative time atomically refreshes route freshness'
);

select throws_ok(
  $$update world_private.worlds set current_world_minute=1200
    where id='10000000-0000-4000-8000-000000000001'::uuid$$,
  '22023','world_minute_regression','narrative time cannot regress'
);
```

- [ ] **Step 6: Preserve RLS and 8D route precision tests**

Extend `rls.test.sql` so each authenticated player sees only their own safe metadata and cannot INSERT/UPDATE projection rows.

Keep all WKT assertions in `player_route_knowledge.test.sql`; add one case where metadata changes but the expected path is unchanged.

- [ ] **Step 7: Regenerate types, run DB GREEN and commit**

```bash
pnpm db:reset
pnpm db:test
pnpm db:types > supabase/database.types.ts
pnpm prettier --write supabase/database.types.ts
git add supabase/migrations/20260901043000_player_knowledge_metadata_v0.sql supabase/tests/database/player_knowledge_metadata.test.sql supabase/tests/database/player_route_knowledge.test.sql supabase/tests/database/rls.test.sql supabase/seed.sql supabase/database.types.ts
git commit -m "feat: materialize safe player knowledge metadata"
```

Verify generated node type has no raw `confidence` and both node/route rows have the five safe fields.

---

### Task 3: Add the common typed `MapProjection` envelope

**Files:**
- Create: `packages/map-renderer/src/knowledge-presentation.ts`
- Modify: `packages/map-renderer/src/index.ts`
- Modify: `packages/map-renderer/src/projection.ts`
- Modify: `packages/map-renderer/src/player-projection.ts`
- Modify: renderer tests listed in File Map.

**Interfaces:**
- Produces `ProjectionKnowledgePresentation` shared by nodes/routes.
- Removes numeric node confidence from projection contract.

- [ ] **Step 1: Write RED builder tests**

Use:

```ts
const knowledgePresentation = {
  confidence: 'high',
  source: { kind: 'npc', label: 'Mestre Han' },
  freshness: 'recent',
  privacy: 'private',
} as const;
```

Assert builder copies it to node and route. Remove numeric confidence from test node input and assert serialized output has no numeric confidence property.

Run:

```bash
pnpm vitest run packages/map-renderer/src/player-projection.test.ts
```

- [ ] **Step 2: Create `knowledge-presentation.ts`**

```ts
export const PROJECTION_CONFIDENCE_BANDS = ['low','moderate','high','very-high'] as const;
export type ProjectionConfidenceBand = (typeof PROJECTION_CONFIDENCE_BANDS)[number];

export const PROJECTION_KNOWLEDGE_SOURCE_KINDS = ['system','exploration','npc','player','document','scene'] as const;
export type ProjectionKnowledgeSourceKind = (typeof PROJECTION_KNOWLEDGE_SOURCE_KINDS)[number];

export const PROJECTION_FRESHNESS_VALUES = ['just-updated','recent','aging','stale','not-applicable'] as const;
export type ProjectionFreshness = (typeof PROJECTION_FRESHNESS_VALUES)[number];

export const PROJECTION_KNOWLEDGE_PRIVACY_VALUES = ['private','shared','public'] as const;
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

Export it from `index.ts`.

- [ ] **Step 3: Require the envelope on Player nodes/routes**

Remove `confidence?: number` from `ProjectionNode`. Add required `knowledgePresentation` to `ProjectionNode` and `ProjectionRoute`. Replace `PlayerProjectionNodeInput.confidence` with `knowledgePresentation`; add it to route input; builder copies it unchanged.

- [ ] **Step 4: Add defense-in-depth tests**

Under malicious `knowledgePresentation.source` objects, ensure forbidden keys `sourceLocationId`, `sourceRouteId`, `canonicalId`, `worldId`, `ownerUserId`, `secretPayload` still trip `assertPlayerProjectionSafe`.

Add metadata to `projection-route-safety.test.ts` while preserving exact route points.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm vitest run packages/map-renderer/src/player-projection.test.ts packages/map-renderer/src/projection-safety.test.ts packages/map-renderer/src/projection-route-safety.test.ts
git add packages/map-renderer/src/knowledge-presentation.ts packages/map-renderer/src/index.ts packages/map-renderer/src/projection.ts packages/map-renderer/src/player-projection.ts packages/map-renderer/src/player-projection.test.ts packages/map-renderer/src/projection-safety.test.ts packages/map-renderer/src/projection-route-safety.test.ts
git commit -m "feat: add typed player knowledge presentation"
```

---

### Task 4: Enforce the envelope in Zod and the Player DB adapter

**Files:**
- Modify: `packages/world-schema/src/schemas.ts`
- Modify: `packages/world-schema/src/schemas.test.ts`
- Modify: `apps/player/lib/map/player-projection-source.ts`
- Modify: `apps/player/lib/map/player-projection-source.test.ts`

**Interfaces:**
- Produces strict schema validation and `readKnowledgePresentation(row)` from only player-safe DB columns.

- [ ] **Step 1: Write RED world-schema tests**

Accept one valid node and route envelope. Reject unknown confidence/source/freshness/privacy values, sourceRef/sourceId/canonicalId keys, whitespace source label, 121-code-point source label, legacy numeric projection confidence, unknown envelope key and missing envelope.

Run `pnpm vitest run packages/world-schema/src/schemas.test.ts` and confirm RED.

- [ ] **Step 2: Add strict Zod schemas with Unicode-code-point validation**

Use the runtime arrays from `@murim/map-renderer`. Source label must not use `.max(120)` because JS length is UTF-16 code units. Use:

```ts
const safeSourceLabelSchema = z.string().trim().min(1).refine(
  (value) => Array.from(value).length <= PLAYER_KNOWLEDGE_SOURCE_LABEL_MAX_LENGTH,
  { message: 'Source label exceeds 120 Unicode code points' },
);
```

Then:

```ts
const projectionKnowledgeSourceSchema = z.object({
  kind: z.enum(PROJECTION_KNOWLEDGE_SOURCE_KINDS),
  label: safeSourceLabelSchema.optional(),
}).strict();

const projectionKnowledgePresentationSchema = z.object({
  confidence: z.enum(PROJECTION_CONFIDENCE_BANDS),
  source: projectionKnowledgeSourceSchema,
  freshness: z.enum(PROJECTION_FRESHNESS_VALUES),
  privacy: z.enum(PROJECTION_KNOWLEDGE_PRIVACY_VALUES),
}).strict();
```

Require it on nodes/routes; remove legacy projection numeric confidence.

- [ ] **Step 3: Rewrite adapter fixtures and write RED adapter tests**

Default node/route rows use:

```text
confidence_band='very-high'
source_kind='exploration'
source_label='Chegada própria'
freshness='not-applicable'
privacy='private'
```

Assert SELECT strings include the five safe columns and exclude raw `confidence`, narrative-minute fields and canonical mapping IDs.

Reject every unknown enum, non-string source label, whitespace label and >120-code-point label. Accept null label and normalize a trimmed safe label. Assert serialized projection contains no raw time or numeric confidence.

- [ ] **Step 4: Implement `readKnowledgePresentation`**

Validate exact membership against imported arrays. For source label:

```ts
const trimmed = raw.trim();
if (trimmed.length === 0 || Array.from(trimmed).length > PLAYER_KNOWLEDGE_SOURCE_LABEL_MAX_LENGTH) {
  throw new Error('Invalid player knowledge source label');
}
```

Return only:

```ts
{
  confidence: row.confidence_band,
  source: { kind: row.source_kind, ...(sourceLabel === undefined ? {} : { label: sourceLabel }) },
  freshness: row.freshness,
  privacy: row.privacy,
}
```

Node/route SELECTs read only safe semantic columns. Delete raw numeric confidence parsing. Do not compute freshness/confidence in JS.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm vitest run packages/world-schema/src/schemas.test.ts apps/player/lib/map/player-projection-source.test.ts
git add packages/world-schema/src/schemas.ts packages/world-schema/src/schemas.test.ts apps/player/lib/map/player-projection-source.ts apps/player/lib/map/player-projection-source.test.ts
git commit -m "feat: enforce player knowledge metadata boundary"
```

---

### Task 5: Present safe metadata in the existing node detail UI

**Files:**
- Modify: node detail model/tests, explorer/tests, SVG/tests, style test and `globals.css` listed above.

**Interfaces:**
- `PlayerNodeDetailView` gains geometry-free `knowledgePresentation`.
- Produces centralized Portuguese copy.
- SVG exposes confidence/freshness hooks only.

- [ ] **Step 1: Write RED model tests and formatters**

Assert the view copies the envelope but still has no position, radius, route or DB fields. Required copy:

```text
low -> Baixa
moderate -> Moderada
high -> Alta
very-high -> Muito alta
just-updated -> Atualizada agora
recent -> Recente
aging -> Envelhecendo
stale -> Desatualizada
not-applicable -> Frescor não aplicável
private -> Privada
shared -> Compartilhada
public -> Pública
system -> Sistema
exploration -> Exploração própria
npc -> NPC
player -> Outro jogador
document -> Documento
scene -> Cena
```

Known `source.label` wins over category fallback.

- [ ] **Step 2: Implement geometry-free copy and exhaustive formatters**

Add required `knowledgePresentation: ProjectionKnowledgePresentation` to `PlayerNodeDetailView`; copy fields explicitly rather than passing a whole node.

- [ ] **Step 3: Add RED explorer tests**

Selecting a node must render four labeled values (Confiança, Fonte, Frescor, Privacidade). Known source shows `Mestre Han`; unknown NPC shows `NPC`. Existing click/Enter/Space/Escape/focus behavior and zero-network assertions remain.

- [ ] **Step 4: Render compact metadata**

Use a `<dl className="player-node-knowledge-meta">` with four `<dt>/<dd>` pairs. Never render percentage, raw minute or timestamp.

- [ ] **Step 5: Add SVG semantic hooks only**

Nodes:

```tsx
data-node-confidence={node.knowledgePresentation.confidence}
data-node-freshness={node.knowledgePresentation.freshness}
```

Routes:

```tsx
data-route-confidence={route.knowledgePresentation.confidence}
data-route-freshness={route.knowledgePresentation.freshness}
```

Do not emit source label/privacy in SVG attributes. Tests must prove route points and ghost radius are unchanged.

- [ ] **Step 6: Add restrained CSS and style regression**

Use compact grid styles for the `<dl>`. Confidence/freshness selectors may only alter subtle opacity/dash/stroke presentation already authorized. The style test must reject selectors/rules that hide items or change geometry based on these metadata.

- [ ] **Step 7: Run GREEN and commit**

```bash
pnpm vitest run apps/player/lib/map/player-node-detail-model.test.ts apps/player/app/player-map-explorer.test.tsx apps/player/app/player-map-svg.test.tsx apps/player/app/player-map-styles.test.ts
git add apps/player/lib/map/player-node-detail-model.ts apps/player/lib/map/player-node-detail-model.test.ts apps/player/app/player-map-explorer.tsx apps/player/app/player-map-explorer.test.tsx apps/player/app/player-map-svg.tsx apps/player/app/player-map-svg.test.tsx apps/player/app/player-map-styles.test.ts apps/player/app/globals.css
git commit -m "feat: present player knowledge metadata"
```

---

### Task 6: Prove A/B isolation and run CI-equivalent verification

**Files:**
- Modify: `scripts/database-api-leakage-test.mjs`
- Modify: `scripts/player-auth-projection-test.mjs`
- Modify compile-only fixtures that now require `knowledgePresentation`.

**Interfaces:**
- Produces PostgREST + real-Auth evidence that only safe semantic metadata reaches each player.

- [ ] **Step 1: Add PostgREST assertions**

For A and B, assert safe columns exist and responses do not expose raw confidence, world-minute fields, `origin_label_known`, source/canonical mapping IDs or another player's semantic row. Specifically prove A's unknown NPC has `source_label === null`.

- [ ] **Step 2: Add real-Auth projection assertions**

Verify `/api/map-projection` carries the qualitative envelope, retains A/B different projections, and does not serialize raw confidence or narrative-minute/private field names.

- [ ] **Step 3: Run integration checks**

```bash
pnpm db:reset
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

- [ ] **Step 4: Run complete quality gate**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If compile-only fixtures instantiate Player nodes/routes without the now-required envelope, add the minimal safe envelope to those fixtures; do not weaken the contract to optional.

- [ ] **Step 5: Run complete database gate and generated-type drift check**

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

Expected: all green and empty diff.

- [ ] **Step 6: Search for forbidden Player-facing raw fields**

```bash
rg -n "current_world_minute|learned_world_minute|refreshed_world_minute|freshness_window_minutes|origin_label_known|source_location_id|source_route_id" apps/player packages/map-renderer
rg -n "confidence\?: number|confidence: number" apps/player packages/map-renderer
```

Expected: no matches. Numeric confidence remains valid only in private/domain persistence, not these Player-facing packages.

- [ ] **Step 7: Commit Task 6**

```bash
git add scripts/database-api-leakage-test.mjs scripts/player-auth-projection-test.mjs apps/player packages/map-renderer packages/world-schema supabase/database.types.ts
git commit -m "test: prove player knowledge metadata isolation"
```

---

### Task 7: Close 8F with verified evidence and a draft PR

**Files:**
- Create: `docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`
- Update Drive canonical Master/checklist only after final GitHub CI evidence exists.

**Interfaces:**
- Produces canonical 8F checkpoint.
- No merge and no deploy.

- [ ] **Step 1: Verify the current functional branch head in GitHub CI**

Because repository writes already land on the remote branch, do not invent a separate push step. Read the branch head and associated Actions run. Require both `quality` and `database` success. Record the exact SHA and run ID in working notes for the next step.

- [ ] **Step 2: Write the status doc using the values read in Step 1**

The first four status lines must name the fixed base SHA, branch name, the exact functional head SHA returned by GitHub, and the exact successful Actions run ID returned by GitHub. Do not prefill guessed values.

Document only verified behavior: qualitative confidence, safe source-known rule, world-minute freshness, descriptive privacy, common node/route envelope, raw-confidence removal, atomic freshness recalculation, A/B isolation, unchanged 8D route precision and unchanged 8E local selection.

Do not claim Playwright/device QA, actual sharing, notes, calendar or deploy.

- [ ] **Step 3: Update progress doc and commit documentation**

Mark 8F closed in `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` only after Step 1 is green; keep Gate 8 open and list notes, controlled sharing and mobile/touch closure as remaining.

```bash
git add docs/PLAYER_KNOWLEDGE_METADATA_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: close player knowledge metadata 8F"
```

- [ ] **Step 4: Verify documentation-head CI**

Read the new branch head and associated Actions run; require `quality` + `database` success again. Use this final documentation head as the 8F final head.

- [ ] **Step 5: Open a draft PR**

Create:

```text
Title: Foundation V0 — Player Knowledge Metadata 8F
Base: foundation/player-node-details-v0
Head: foundation/player-knowledge-metadata-v0
Draft: true
```

PR body states scope, migration, world-minute-vs-full-clock distinction, security boundary, exact CI evidence, exclusions and `UNMERGED / NO DEPLOY`.

- [ ] **Step 6: Align Drive from verified Git evidence**

Check `Implementar confiança, origem, frescor e privacidade`, append 8F evidence, and update Gate 8 progress text to include `8F VERDE`. Keep Gate 8 itself open. Do not mark notes, sharing or mobile/touch complete. Align Master wording to the same final head/CI evidence.

- [ ] **Step 7: Verify final closure invariants**

Confirm all eight facts before reporting closure:

```text
branch is based on 8E
spec is committed
implementation plan is committed
functional CI is green
final documentation CI is green
draft PR is open and unmerged
Drive is aligned
no deploy occurred and Gate 8 remains open
```
