# Player Knowledge Metadata 8F — Design

Status: Design approved in chat; written spec awaiting human review

Date: 2026-09-01

Base: Gate 8E final head `c4a6a90bfeffd5c20d3608f27bc52423e8291563`

Branch: `foundation/player-knowledge-metadata-v0`

## 1. Scope

Gate 8F implements player-facing confidence, origin, freshness and privacy semantics for PlayerKnowledge while preserving the anti-leak boundary established in 8A–8E.

Included:

- one reusable typed knowledge-presentation envelope for player map nodes and routes;
- qualitative confidence instead of raw numeric confidence in player-facing projection contracts;
- safe source category plus optional player-known source label;
- narrative freshness derived from world time, never wall-clock time;
- a minimal monotonic world-minute coordinate sufficient for freshness calculations;
- transactional refresh of affected player projections when that coordinate advances;
- private/shared/public presentation state without implementing sharing actions;
- strict source parsing, projection schema validation and anti-leak checks;
- compact node-detail presentation of the four dimensions;
- reusable route metadata even though route-detail UI remains deferred;
- DB/RLS/PostgREST/Auth A/B/security/regression coverage.

Excluded:

- private player notes;
- player actions to share, sell, hide, falsify or transmit information;
- full rumor network mechanics;
- faction clocks;
- autonomous or scheduled world-clock progression;
- calendar/month/season/time-of-day systems;
- route detail interaction UI;
- pan/zoom refinement;
- full Playwright multi-browser/device coverage;
- PixiJS/WebGPU;
- any canonical/source/world ID in player-facing contracts.

Gate 8 remains open after 8F.

## 2. Existing invariants preserved

8F preserves all 8A–8E invariants:

1. Browser/request never chooses authenticated player identity.
2. `apps/player` never receives service-role credentials.
3. Player path never queries/imports `world_private`.
4. No browser Supabase client is introduced.
5. `MapProjection` remains the anti-leak boundary.
6. Player-facing IDs remain projection-local.
7. Renderer never reconstructs hidden identity, source identity or geometry.
8. Raw source/database errors never reach player UI.
9. Fail-closed behavior is mandatory when malformed metadata could weaken the boundary.
10. Route precision rules from 8D remain unchanged.
11. Node selection from 8E remains local and causes no fetch/server action/lookup.
12. Confidence, freshness and privacy are presentation semantics; they never authorize more world truth.

## 3. Selected architecture

8F uses a typed semantic intermediary between private canonical knowledge and UI copy.

Rejected alternatives:

**Raw values in `MapProjection`:** rejected because exposing `confidence = 0.73`, raw world-minute values or raw private source metadata creates unnecessary precision and pushes narrative policy into the frontend.

**Preformatted text in the database:** rejected because storing strings such as `Confiança alta` or `Fonte: Mestre Han` couples persistence to Portuguese copy and makes future presentation changes migrations rather than typed presentation changes.

Selected flow:

1. trusted private knowledge stores canonical/raw values;
2. trusted server-side projection materialization converts them into constrained player-safe metadata;
3. `player_api` exposes only those safe semantic values under existing owner RLS;
4. the Player DB adapter strictly parses the safe values;
5. `MapProjection` carries a typed presentation envelope;
6. node detail UI formats that envelope into human-readable copy;
7. route metadata uses the same envelope for consistency, without adding route-detail UI in 8F.

No browser layer computes confidence bands, resolves source identity or evaluates freshness.

## 4. Common player-safe knowledge envelope

Add one common semantic contract usable by both `ProjectionNode` and `ProjectionRoute`:

```ts
export type ProjectionConfidenceBand = 'low' | 'moderate' | 'high' | 'very-high';

export type ProjectionKnowledgeSourceKind =
  'system' | 'exploration' | 'npc' | 'player' | 'document' | 'scene';

export interface ProjectionKnowledgeSource {
  kind: ProjectionKnowledgeSourceKind;
  label?: string;
}

export type ProjectionFreshness = 'just-updated' | 'recent' | 'aging' | 'stale' | 'not-applicable';

export type ProjectionKnowledgePrivacy = 'private' | 'shared' | 'public';

export interface ProjectionKnowledgePresentation {
  confidence: ProjectionConfidenceBand;
  source: ProjectionKnowledgeSource;
  freshness: ProjectionFreshness;
  privacy: ProjectionKnowledgePrivacy;
}
```

`ProjectionNode` and `ProjectionRoute` gain:

```ts
knowledgePresentation: ProjectionKnowledgePresentation;
```

The exact final symbol names may follow existing package naming conventions, but the semantic shape and allowed values are fixed by this design.

## 5. Confidence semantics

The player sees qualitative confidence only.

Raw canonical/private confidence remains numeric `0..1`. The player-facing projection does not expose that number.

Initial deterministic bands:

- `0 <= confidence < 0.40` → `low`;
- `0.40 <= confidence < 0.70` → `moderate`;
- `0.70 <= confidence < 0.90` → `high`;
- `0.90 <= confidence <= 1.00` → `very-high`.

These thresholds are server-side policy and require boundary tests at exact edges.

Confidence never changes `knowledgeState`.

Examples:

- a `rumor` with `very-high` confidence remains a rumor;
- a `confirmed` location with `low` confidence remains confirmed unless another domain action changes its state.

The existing numeric `confidence` column in `player_api.map_nodes` must not remain player-readable after 8F. It must be removed or replaced by a qualitative player-safe representation. Routes receive the same qualitative representation.

## 6. Origin/source semantics

Allowed source categories are fixed:

- `system`;
- `exploration`;
- `npc`;
- `player`;
- `document`;
- `scene`.

The player-facing source consists of category plus an optional already-authorized display label.

Rule:

- if the character knows the specific source identity, trusted knowledge data may contain a safe display label such as `Mestre Han`;
- if the character does not know the identity, the display label is null/absent and only the category such as `npc` is exposed;
- never resolve or infer the source label in the Player request path by looking up canonical world entities;
- never expose `sourceRef`, source entity IDs, canonical IDs, database IDs or owner IDs as source labels or fallback values.

For 8F, the existing private `origin_label` column is defined narrowly as **the player-known display label for this knowledge record**. A non-null value therefore means trusted server/domain code has already established that this character knows that source label. `null` means only the category is known/presentable.

If later systems need a canonical source reference or a hidden source identity distinct from what the character knows, that must live in a separate private-only field/entity and must never be overloaded into `origin_label`.

The player-facing label is plain text, trimmed, non-empty and length-bounded. Initial maximum: 120 characters after trim. Whitespace-only/control-character-only labels are invalid. No HTML or interpreted Markdown is required.

## 7. Freshness uses narrative world time

Freshness is based on elapsed in-world time, not wall-clock time and not `learned_at`/`refreshed_at` timestamps.

Existing real timestamps remain useful for audit and operational history. They are not the freshness source of truth.

### 7.1 Minimal world-time coordinate

8F introduces only the minimum temporal primitive required by Gate 8:

```ts
type WorldMinute = non-negative integer;
```

Each world has a current monotonic world-minute coordinate. Knowledge rows store the world minute at which they were learned/refreshed.

Required private fields conceptually are:

```text
current_world_minute
learned_world_minute
refreshed_world_minute
freshness_window_minutes?
```

This is deliberately not the full `clocks de facções/mundo` subsystem deferred by the Foundation checklist to later expansion. 8F does not add autonomous ticking, schedules, calendars, seasons, faction clocks, time-of-day simulation or background progression. It adds a scalar narrative coordinate because Gate 8 explicitly requires freshness and the rule engine already recognizes `world_clock` as a domain concept.

A later calendar may map the scalar coordinate to dates/times without changing the Player presentation contract.

### 7.2 Monotonicity and canonical mutation

All world-minute values are integers `>= 0`.

`current_world_minute` may never regress through the canonical mutation path.

For a knowledge record:

- `learned_world_minute <= refreshed_world_minute`;
- `refreshed_world_minute <= current_world_minute` when projecting;
- malformed or future knowledge time fails closed rather than producing a negative age.

8F does not require a public/player-facing world-minute field.

World-minute advancement must go through a trusted server-side canonical mutation, conceptually equivalent to:

```ts
advanceWorldMinute(worldId, nextWorldMinute);
```

The operation must:

1. reject `nextWorldMinute < current_world_minute`;
2. persist the new minute;
3. recompute/materialize freshness for all affected player node/route projections in that world;
4. commit the minute change and derived projection refresh atomically.

There is no background tick. Advancing narrative time is an explicit trusted action.

This transactional refresh is required because `player_api` stores semantic freshness bands rather than raw narrative timestamps. Without it, the exposed projection could remain incorrectly `recent` after the world has advanced.

### 7.3 Freshness window

Not every fact becomes stale at the same rate.

Knowledge may have an optional positive `freshness_window_minutes`.

If absent, freshness is `not-applicable`.

Examples:

- mountain location: no freshness window required;
- current patrol position or market condition: may have a short freshness window;
- political control or route safety: may have a larger window.

This prevents a global rule such as “every location becomes stale after three days.”

### 7.4 Freshness classification

Define:

```text
age = current_world_minute - refreshed_world_minute
window = freshness_window_minutes
```

If no window exists: `not-applicable`.

If `age == 0`: `just-updated`.

If `0 < age < 0.5 * window`: `recent`.

If `0.5 * window <= age < window`: `aging`.

If `age >= window`: `stale`.

Freshness does not automatically mutate `knowledgeState`, confidence or geometry. A stale fact remains present and explicitly stale until another domain action changes/removes it.

## 8. Privacy semantics

8F supports three descriptive player-facing privacy states:

```ts
'private' | 'shared' | 'public';
```

Meaning:

- `private`: knowledge currently belongs to this character's private knowledge surface;
- `shared`: knowledge is marked as belonging to a bounded/shared informational context rather than purely private or globally public;
- `public`: knowledge is treated as public knowledge for presentation purposes.

These values are metadata, not ACLs.

They do not grant database access, broaden RLS, reveal another player's row, or implement transmission. In 8F, `shared` deliberately does not encode the audience list; the later sharing cut owns actual participants/authorization.

The later KnowledgeFact-sharing cut remains responsible for the actual authorization/data flow for sharing. 8F may seed/materialize `shared` metadata for tests or trusted server scenarios, but does not expose a player action that creates it.

## 9. Database materialization boundary

Private truth remains in `world_private`; player-readable semantics remain in `player_api`.

8F should prefer explicit constrained columns in `player_api.map_nodes` and `player_api.map_routes` rather than an arbitrary free-form metadata blob.

Conceptual player-facing columns:

```text
confidence_band
source_kind
source_label nullable
freshness
privacy
```

The exact SQL enum/check implementation is an implementation detail, but every field must be allow-listed and constraint-backed.

Private knowledge for locations and routes gains the narrative-time/privacy inputs needed to derive those values. Its `origin_label` means only the already-player-known presentation label described in section 6.

The server-side refresh/materialization functions remain the only place where private raw values become player-safe semantic values. Knowledge-row changes and explicit world-minute advancement must both keep the corresponding player-facing semantic projection synchronized.

Player clients retain SELECT-only access under owner RLS.

No canonical source/entity ID is added to `player_api`.

## 10. Projection-source parsing

`apps/player/lib/map/player-projection-source.ts` remains the DB adapter.

For both nodes and routes it must:

- select only player-safe semantic columns from `player_api`;
- strictly validate exact enum values;
- normalize optional source label;
- reject malformed source labels;
- reject missing required semantic dimensions;
- construct the shared typed knowledge-presentation envelope;
- never read or reconstruct raw numeric confidence;
- never compute freshness from `updated_at` or JavaScript wall-clock time.

Malformed metadata fails the entire projection load closed. Existing sanitized unavailable UI remains the user-visible failure behavior.

## 11. Projection schema and anti-leak guard

`packages/world-schema` adds a strict schema for the common knowledge-presentation envelope and requires it on player map nodes/routes produced by the Player projection builder.

Unknown keys fail.

The recursive anti-leak guard continues to scan the complete projection tree, including source labels and metadata objects.

Forbidden key families remain forbidden even if nested beneath `knowledgePresentation`.

No source/world/canonical/owner identifier alias may be introduced as an allowed key.

## 12. Node and route scope

The metadata architecture is common to both nodes and routes because the existing private route-knowledge table already owns confidence, origin and refresh timestamps and Gate 8 describes PlayerKnowledge rather than nodes only.

8F behavior:

- nodes: metadata is materialized, projected and displayed in the existing compact node detail panel;
- routes: metadata is materialized and projected for contract consistency, but no new route-detail interaction surface is added.

Route geometry and precision behavior from 8D is unchanged. Confidence/freshness/privacy must never select a more precise route geometry.

## 13. UI presentation

The map must not become a telemetry dashboard.

The complete four-dimension presentation belongs in the compact node-detail panel.

Example:

```text
Templo da Garça Cinzenta
Ruína investigada

Estado: Investigado
Confiança: Alta
Fonte: Mestre Han
Frescor: Recente
Privacidade: Privada

Há indícios de que o templo ainda...
```

Fallback source example:

```text
Fonte: NPC
```

Portuguese UI labels:

Confidence:

- `low` → `Baixa`;
- `moderate` → `Moderada`;
- `high` → `Alta`;
- `very-high` → `Muito alta`.

Freshness:

- `just-updated` → `Atualizada agora`;
- `recent` → `Recente`;
- `aging` → `Envelhecendo`;
- `stale` → `Desatualizada`;
- `not-applicable` → `Frescor não aplicável`.

Privacy:

- `private` → `Privada`;
- `shared` → `Compartilhada`;
- `public` → `Pública`.

Source category fallback labels must be centralized presentation copy, not persisted Portuguese strings.

### 13.1 Map-level visual effects

8F may add only subtle, deterministic presentation hooks for confidence/freshness.

Allowed:

- data attributes/classes for semantic confidence/freshness state;
- subtle styling that reinforces an already-authorized uncertainty/staleness state.

Not allowed:

- changing geometry;
- reducing/expanding approximate radius from confidence;
- revealing true coordinates;
- changing route precision;
- hiding/showing items based on privacy in the renderer;
- source-based icon changes that reveal hidden identity;
- dense permanent badges/text on every map item.

Origin does not alter node geometry/marker semantics. Privacy does not alter visibility authorization.

## 14. Semantic invariants

The following are explicit 8F invariants:

1. `knowledgeState` and confidence are independent dimensions.
2. Freshness never promotes or demotes `knowledgeState` automatically.
3. Privacy metadata never grants access.
4. Source metadata never causes a canonical lookup in Player presentation.
5. No 8F metadata can improve spatial precision.
6. A `rumor` with `very-high` confidence remains a rumor.
7. A stale fact remains present unless a separate domain rule changes it.
8. A route with high confidence remains constrained by the 8D endpoint-knowledge precision rule.
9. Real timestamps do not determine narrative freshness.
10. The browser does not receive raw confidence or raw narrative-time coordinates.
11. Advancing world time and refreshing derived player-facing freshness is atomic.
12. A specific source label is present only when that label is already known to that player.

## 15. Failure policy

Fail closed on values that make the projection contract unsafe or semantically contradictory.

Projection/materialization must reject or refuse to expose:

- confidence outside `0..1` in private inputs;
- unknown confidence band in player-facing input;
- unknown source kind;
- malformed/oversized source label;
- unknown privacy value;
- unknown freshness value;
- negative/non-integer world minute;
- negative/non-integer/non-positive freshness window when present;
- `learned_world_minute > refreshed_world_minute`;
- `refreshed_world_minute > current_world_minute`;
- attempted world-minute regression through the canonical mutation path;
- unexpected metadata keys;
- identifier-bearing player-facing fields or hidden payload aliases.

A missing freshness window is not an error; it maps to `not-applicable`.

Raw DB/internal errors stay sanitized.

## 16. Required tests

8F is not complete without tests that prove all of the following.

### 16.1 Unit/domain/projection tests

- exact confidence threshold boundaries: `0`, `0.3999`, `0.4`, `0.6999`, `0.7`, `0.8999`, `0.9`, `1`;
- numeric confidence is absent from player-facing `MapProjection` serialization;
- node and route share the same semantic envelope shape;
- known source label vs category-only fallback;
- null private `origin_label` produces category-only source presentation;
- malformed/unknown source kind fails;
- malformed source label fails;
- privacy enum is strict;
- freshness enum is strict;
- no-window freshness becomes `not-applicable`;
- `age == 0` becomes `just-updated`;
- recent/aging/stale thresholds at their exact boundaries;
- negative/future/regressive time contradictions fail;
- real timestamp changes alone do not change narrative freshness;
- advancing world minute changes semantic freshness at the expected boundary;
- anti-leak guard rejects forbidden key aliases beneath the new envelope;
- strict schemas reject unknown keys.

### 16.2 UI tests

- node panel displays qualitative confidence only;
- source displays safe specific label when present;
- source falls back to category label when no specific label exists;
- all freshness labels render correctly;
- all privacy labels render correctly;
- no raw confidence, world-minute or audit timestamp appears in the node panel;
- selecting a node still causes no fetch/server action/Supabase client request;
- keyboard/pointer behavior from 8E remains intact.

### 16.3 DB/security tests

- new private columns/constraints rebuild from zero migration history;
- raw numeric confidence is not readable from `player_api.map_nodes` after 8F;
- routes expose only qualitative metadata;
- world minute cannot regress through the trusted canonical advance function;
- world-minute advance atomically recomputes freshness for affected node and route projections;
- failed freshness rematerialization rolls back the world-minute advance;
- owner A cannot read owner B metadata via direct SQL/RLS path;
- PostgREST A/B leakage smoke proves the same isolation;
- real Auth A/B projection smoke proves player sessions receive distinct authorized metadata;
- player cannot mutate player-facing metadata or world time;
- no `world_private` grant or schema exposure regression;
- no canonical/source IDs appear in exposed tables;
- route precision fixtures remain identical to 8D expectations for equivalent knowledge states;
- generated DB types have no drift;
- `supabase db reset` remains deterministic.

### 16.4 Full regression gate

Before closure:

- format check green;
- lint green;
- typecheck green;
- unit/integration tests green;
- build green;
- database/RLS tests green;
- PostgREST leakage smoke green;
- Auth A/B smoke green;
- generated DB types green;
- frozen-lock install/CI green.

## 17. Documentation and Gate status

On technical closure of 8F:

- add/update a repo status document for 8F evidence;
- update `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`;
- update canonical Drive Master/Checklist only after CI proves the final documented head;
- mark only `Implementar confiança, origem, frescor e privacidade` complete;
- do not mark notes, sharing or mobile/full-device QA complete;
- Gate 8 remains open.

No merge or deploy is part of 8F unless separately authorized.

## 18. Definition of done for 8F

8F is complete when:

1. raw confidence remains private and Player receives only qualitative confidence;
2. source is category + optional explicitly player-known label, with no ID lookup/leak;
3. freshness is derived solely from monotonic in-world minutes plus optional per-knowledge freshness window;
4. explicit world-time advancement atomically refreshes affected player-facing freshness without background ticking;
5. privacy is represented as private/shared/public without implementing sharing authorization;
6. nodes and routes use the same typed semantic envelope;
7. the existing node-detail panel presents the four dimensions compactly;
8. no metadata changes geometry, route precision or authorization;
9. malformed metadata fails closed and errors remain sanitized;
10. RLS/PostgREST/Auth A/B and anti-leak tests remain green;
11. full CI is green on the final documented head;
12. canonical Drive status is updated only after that evidence exists;
13. Gate 8 remains open for notes, sharing and mobile-quality work.
