# Player Route Knowledge V0 — Gate 8D Design

Date: 2026-08-31
Status: Design approved in chat; written spec awaiting human review
Branch: `foundation/player-route-knowledge-v0`
Base: `68bdd424348822e297ad4803367a16243dddb070`

## 1. Purpose

Gate 8D adds safe player-facing route knowledge degrees without weakening the anti-leak boundary established by Gates 8A–8C.

The problem is architectural, not cosmetic: today a visible route in `MapProjection` always carries a complete `PolylineGeometry`. Styling a low-knowledge route differently would still leak exact route geometry if the canonical line were supplied to the player.

The V0 goal is therefore:

- keep `MapProjection` as the only renderer input;
- ensure low-knowledge routes never expose canonical route geometry;
- preserve existing player isolation and fail-closed behavior;
- keep SVG/React presentation simple;
- establish an extensible foundation for richer route uncertainty later without overbuilding V0.

## 2. Scope

### In scope

- route knowledge states already standardized by the project:
  - `rumor`
  - `indication`
  - `localized`
  - `confirmed`
  - `investigated`
  - `understood`
- private per-player route-knowledge truth;
- safe database-owned materialization into `player_api.map_routes`;
- safe exact-vs-topological route geometry selection;
- renderer presentation by knowledge state;
- unit, database/RLS, PostgREST leakage and Auth A/B tests;
- status/progress documentation for 8D.

### Explicitly out of scope

- compact/touch node detail UI; that is Gate 8E;
- pan/zoom or map interaction;
- route editing;
- navigation/pathfinding;
- route traversal simulation;
- exact travel cost, terrain, danger, blockage or timing mechanics;
- uncertainty corridors or fuzzy polylines;
- per-segment knowledge;
- conflicting route reports;
- unknown-endpoint routes such as “a road continues somewhere”;
- Pixi/WebGPU migration;
- merge or deploy.

## 3. Security invariants

All 8B security invariants remain permanent and 8D adds route-specific invariants.

1. Browser/request identity never chooses another `playerId`.
2. No browser service-role or privileged credential.
3. Player code never reads `world_private` directly.
4. Renderer consumes only authorized `MapProjection`.
5. Canonical route IDs, world IDs and canonical endpoint IDs never enter the player projection surface.
6. Low-knowledge route rows exposed through `player_api` never contain canonical route geometry.
7. A route cannot reveal more positional precision than either endpoint already authorizes.
8. If any required authorization precondition is absent, the route fails closed.
9. Direct PostgREST access to `player_api.map_routes` must remain safe even if the React application is bypassed completely.
10. Route labels and details exposed to the player must be independently authorized; they are never copied automatically from canonical route name/payload fields.
11. Raw source/database errors never surface in player UI.

## 4. Chosen architecture

### 4.1 Private source of truth

Add a private per-player route knowledge relation, named:

`world_private.player_route_knowledge`

It is conceptually parallel to `world_private.player_location_knowledge` and records route knowledge without exposing canonical relationships to the player surface.

The V0 row must contain the minimum required facts:

- `owner_user_id`;
- canonical private route reference;
- player-local `projection_id`;
- `state`;
- `confidence`;
- origin metadata consistent with existing knowledge patterns;
- nullable player-safe `projection_label` that is explicitly authorized for presentation;
- learned/refreshed timestamps.

The exact SQL column names and constraints may follow established migration conventions, but the semantics above are mandatory.

No speculative V1 columns such as uncertainty corridors, per-segment facts or conflicting-source arrays are added in 8D.

### 4.2 Public player projection surface

`player_api.map_routes` remains the public-safe route surface.

It must continue to expose only player-local projection identifiers and sanitized values. It must not expose:

- canonical route ID;
- canonical location IDs;
- `world_id`;
- private payloads;
- source/private foreign keys;
- geometry with more precision than the player is authorized to know.

For 8D, `label` comes only from the explicitly authorized private `projection_label`; the materializer never derives it from `world_private.routes.name`.

For 8D, `details` remains empty/safe by default and must never copy `world_private.routes.payload`, `secret_payload`, origin metadata, or other private fields. Richer player-facing route facts are deferred to later cuts.

The route projection source in the application remains a consumer/validator of `player_api`; it is not promoted into the primary secret-sanitization layer.

### 4.3 Database-owned materialization boundary

A dedicated private database routine owns route materialization. The planned V0 contract is a function equivalent to:

`world_private.refresh_player_route_projection(p_owner_user_id uuid)`

Exact SQL syntax is an implementation detail, but these properties are mandatory:

- it executes in a trusted database/service-role context, not from browser/player code;
- `EXECUTE` is revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`;
- it does not need `SECURITY DEFINER` because `service_role` already owns the required private/public projection privileges; prefer normal invoker semantics to reduce privilege surface;
- it recomputes the selected player's `player_api.map_routes` rows transactionally from private route knowledge plus already-sanitized endpoint projection state;
- it is the sole 8D path that converts canonical route truth into player-facing route geometry;
- application/player code never performs a second, secret-aware sanitization pass.

Trusted future narrator/admin mutation flows may invoke this routine after knowledge changes. Seed/tests may invoke it explicitly. Automatic trigger orchestration is intentionally not introduced in 8D because node and route knowledge can change independently and trigger coupling would add unnecessary complexity.

### 4.4 Exact-vs-topological geometry rule

Knowledge states are divided into two geometry classes.

#### Low states

- `rumor`
- `indication`
- `localized`

These states never expose canonical route geometry.

Their public route geometry is a synthetic/topological polyline constructed only from coordinates already authorized in the player-facing endpoint projections.

For V0, the safe topological representation is the minimal connection between the two authorized endpoint presentation positions.

Endpoint presentation position means:

- known node → its authorized exact `position`;
- ghost node → its authorized `approximateLocation.center`.

The topological route must not consult a private/canonical endpoint coordinate to improve the line.

#### High states

- `confirmed`
- `investigated`
- `understood`

These states may expose the canonical route line only when both route endpoints are themselves authorized at exact known positions.

If either endpoint is a ghost/approximate node, the route falls back to the same safe topological representation used by low states.

This means route knowledge state and spatial precision are deliberately independent concepts. A player may know that a route is confirmed without knowing its exact geometry.

### 4.5 Endpoint presence rule

A projected route is included only when both endpoint projection IDs are present in the same authorized player projection.

If either endpoint is absent, the route is omitted entirely.

Unknown-endpoint routes are intentionally deferred to a later contract rather than improvised in 8D.

## 5. MapProjection contract

The V0 preserves the current renderer-facing route shape as much as practical:

- `ProjectionRoute.path` remains present for rendered routes;
- renderer does not receive canonical/private source identifiers;
- renderer does not infer hidden geometry;
- renderer does not perform authorization logic.

The `path` supplied to a route is simply the geometry already authorized for presentation:

- topological/synthetic when exact geometry is not allowed;
- exact when the route state and both endpoint precision rules allow it.

Knowledge state remains available for presentation semantics.

This avoids introducing a premature discriminated geometry union in 8D while keeping future migration possible if later features require explicit uncertainty geometry types.

## 6. Data flow

The mandatory flow is:

1. canonical route truth exists only in `world_private`;
2. per-player route knowledge exists in `world_private.player_route_knowledge`;
3. trusted server/admin mutation logic changes private knowledge when appropriate;
4. the private database materialization routine determines whether each route is visible and whether its public geometry is exact or topological;
5. topological geometry is built only from already-sanitized endpoint projection positions;
6. only sanitized rows are written to `player_api.map_routes`;
7. RLS limits those rows to the authenticated owner;
8. the application projection source loads `player_api` rows with the request-scoped player session;
9. parsing/building produces `MapProjection`;
10. anti-leak validation runs before presentation;
11. the server SVG renderer draws the supplied route without private-world access.

No security decision is delegated to CSS or to client-side rendering.

## 7. Renderer presentation

The SVG renderer remains one route renderer, not six route components.

Knowledge-state metadata controls visual presentation only.

V0 visual hierarchy:

- `rumor`: faintest and most fragmented;
- `indication`: still broken/dashed, more legible than rumor;
- `localized`: clearly visible approximate connection, still non-solid;
- `confirmed`: solid route treatment;
- `investigated`: solid and visually more established;
- `understood`: strongest/most established treatment in the current set.

Exact colors are not part of the architectural contract. Styling must remain accessible and readable in the existing visual system.

Presentation must not imply that a solid/high-state route is spatially exact when the backend supplied a topological fallback. State communicates epistemic confidence/existence; geometry communicates only the precision actually authorized.

## 8. Error and fail-closed behavior

The feature must fail closed.

Examples:

- malformed private knowledge row → do not expose route;
- invalid or missing endpoint projection → omit route;
- low-state route unexpectedly associated with canonical geometry at the public boundary → test failure and no accepted implementation;
- high-state route with a ghost endpoint → topological fallback;
- projection parsing failure → existing safe unavailable behavior;
- materialization failure → transaction rolls back rather than leaving a mixed partially refreshed route set;
- source/database errors → generic player-safe unavailable state, never raw database content.

## 9. Testing strategy

Implementation must be test-driven.

### 9.1 Unit/domain tests

Prove at minimum:

- low states produce only safe topological route paths;
- high states with two exact endpoints can produce exact authorized route paths;
- high state + any ghost endpoint produces topological fallback;
- absent endpoint removes route;
- renderer emits state-specific presentation metadata/styles;
- renderer never reconstructs path geometry from private assumptions;
- viewport continues to include the supplied authorized route geometry only.

### 9.2 Adversarial geometry fixture

The canonical route fixture must include at least one intermediate point intentionally far away from the straight topological connection between its endpoints.

This makes leakage detectable rather than relying on two geometries that accidentally look similar.

A low-state player must receive a path that does not contain or reproduce that private intermediate canonical point.

### 9.3 Database/RLS tests

Prove at minimum:

- player A sees only A’s route knowledge projection rows;
- player B sees only B’s rows;
- canonical route IDs are absent from the player surface;
- low-state `player_api.map_routes.geom` is non-canonical;
- confirmed+ with exact endpoints may expose exact geometry;
- confirmed+ with an approximate endpoint receives safe fallback;
- route with missing endpoint projection is absent;
- route label is only the explicitly authorized projection label, never the canonical route name by default;
- route details contain no canonical/private payload leakage;
- `authenticated` cannot execute the private materialization routine;
- `service_role` can execute the materialization routine;
- unauthorized user/session cannot cross owner boundaries.

### 9.4 Direct PostgREST leakage smoke

The permanent smoke suite must directly query the exposed `player_api.map_routes` surface and demonstrate that bypassing the React app still cannot retrieve canonical low-state route geometry.

The smoke should compare player sessions A/B and include the adversarial canonical intermediate point described above.

It must also verify that canonical identifiers, canonical route labels/private payloads and the private materialization function are not available through the authenticated player surface.

### 9.5 Regression suite

The existing permanent checks remain required:

- formatter;
- lint;
- typecheck;
- all existing unit tests;
- player build;
- database reset/rebuild from migrations;
- all DB/RLS tests;
- existing PostgREST leakage smoke;
- existing Player Auth A/B projection smoke;
- generated database types with no drift;
- teardown.

## 10. Closure criteria for Gate 8D

8D is technically green only when all of the following are true on the final documented head:

1. private route knowledge model exists and is migration-backed;
2. private service-role-only materialization routine owns canonical-to-player route projection;
3. low-state public route geometry is provably non-canonical;
4. high-state exact geometry requires exact authorized endpoints;
5. ghost endpoint forces topological fallback;
6. missing endpoint suppresses route;
7. player A/B isolation is proven;
8. direct PostgREST route leakage test is green;
9. canonical IDs, canonical labels and private payloads remain absent from player-facing route contracts;
10. renderer visually distinguishes knowledge states without owning authorization logic;
11. all pre-existing 8B/8C security/regression checks remain green;
12. project status docs record the final head and CI evidence;
13. Drive canonical progress is updated only after technical evidence exists;
14. PR is draft/open/unmerged;
15. no deploy occurs;
16. Gate 8 remains open and the next planned cut is 8E — compact/touch node details.

## 11. Extensibility

This V0 deliberately establishes safe semantics without claiming the final route-knowledge model.

Future compatible extensions may include:

- approximate route polylines independent of endpoint-only topology;
- uncertainty corridors;
- partial/per-segment discovery;
- directional knowledge;
- false or contradictory rumors;
- multiple source reports;
- route freshness/decay;
- blocked/destroyed/seasonal routes;
- terrain, danger, cost and travel-time knowledge;
- routes with unknown destinations;
- private player notes;
- controlled sharing of route knowledge.

Such features must preserve the same principle: the player renderer receives only presentation-safe knowledge and never reconstructs hidden world truth.

## 12. Non-decisions preserved for later

8D intentionally does not decide:

- exact visual theme beyond relative hierarchy;
- a generalized uncertainty geometry algebra;
- future knowledge-state additions beyond the current six;
- whether future route facts become a separate generalized `KnowledgeFact` subsystem;
- pathfinding/traversal semantics.

Those choices remain open and should be introduced only when product requirements make them necessary.
