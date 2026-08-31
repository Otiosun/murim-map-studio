# Player SVG Renderer V0 — Gate 8C design

## Status

Approved design for the next Foundation V0 cut after Gate 8B.

- Repository: `Otiosun/murim-map-studio`
- Branch: `foundation/player-renderer-v0`
- Base head: `fd1f11ddf1771b9cc16dca68f2cf109c3b5ac435`
- Predecessor: Gate 8B — Player Auth + Projection Boundary
- Gate target: 8C — first player renderer

## Goal

Render the authenticated player's already-authorized `MapProjection` as a lightweight, accessible SVG/React map without changing the world model, knowledge model, security boundary, or introducing a browser Supabase client.

The renderer must prove that the safe projection produced by Gate 8B can become a visible player map while keeping rendering replaceable and world coordinates canonical.

## Architectural decision

Use server-side React plus SVG as the first player renderer.

`MapProjection` remains the only renderer input. The player page resolves the authenticated session server-side, loads the authorized projection through the existing projection source, and passes that projection to a pure renderer layer. The renderer never queries Supabase, never receives canonical world truth, and never decides authorization.

SVG/React is deliberately preferred over PixiJS/WebGPU for this cut, matching ADR-005 and ADR-022. Pixi remains deferred until profiling on real map scale demonstrates a concrete performance need.

## Data flow

1. Request reaches the protected player page.
2. Server-side Supabase client resolves the authenticated `PlayerSession`.
3. Missing/invalid session redirects to `/login` exactly as in Gate 8B.
4. Existing `createSupabasePlayerProjectionSource` loads the player's `MapProjection` from `player_api` using the authenticated `playerId`.
5. Existing strict schema validation and recursive anti-leak guard remain authoritative before the projection reaches presentation code.
6. A pure renderer-model helper derives a deterministic SVG viewport from the projection's visible geometry only.
7. React renders a semantic SVG representation of nodes and routes.
8. No canonical IDs, `world_private`, service credentials, or hidden geometry enter the renderer.

The page must not call its own HTTP `/api/map-projection` endpoint server-to-server. Both the API route and the page compose the same authenticated projection source directly, avoiding an unnecessary internal HTTP hop while preserving one authorization/source contract.

## Renderer responsibilities

### Projection viewport

A pure helper computes bounds from renderable projection items in world units.

For this cut, bounds include:

- node positions;
- ghost-node uncertainty circles using `approximateLocation.center` and radius;
- every point in route polylines.

The helper adds deterministic padding so edge geometry is not clipped. It must not mutate coordinates or convert world units into persisted pixel coordinates.

If no renderable geometry exists, it returns a stable fallback viewport rather than `NaN`, infinities, or zero-sized bounds.

### Nodes

Render known and ghost nodes as separate presentation states.

Known node:

- exact projected position;
- visible symbol;
- authorized label when present;
- knowledge state exposed only if already present in `MapProjection`.

Ghost node:

- projected approximate center only;
- uncertainty radius rendered visually;
- visually distinguishable from a known node;
- label only when already authorized by the projection.

The renderer must not attempt to infer or recover the canonical location behind a ghost node.

### Routes

Render projection routes from their authorized polyline geometry.

This cut uses the existing `styleKey` / `knowledgeState` only as renderer-safe presentation inputs. It does not create a new route-knowledge domain model.

Route rendering must not require canonical endpoint IDs. `fromItemId` and `toItemId` remain projection-local references.

### Labels

Labels are presentation-only and rendered only when the projection already contains them. The renderer must not synthesize hidden names from metadata or other sources.

### Accessibility

The map SVG has an accessible name and structural semantics appropriate for a visual map. Visible nodes with labels expose readable text without requiring pointer interaction.

Decorative geometry is marked so it does not create noisy duplicate accessibility output.

The page must remain useful if JavaScript hydration is unavailable; this cut requires no client component for the map itself.

## Page composition

Replace the current authenticated placeholder in `apps/player/app/page.tsx` with the real player map composition while preserving the existing authentication redirect and sign-out affordance.

Expected composition:

- authenticated server component;
- server-side projection load;
- explicit projection-unavailable state if the source fails;
- empty-map state when the projection is valid but has no renderable items;
- SVG map when renderable items exist;
- sign-out remains available.

Projection/source errors must not display raw database errors or response payloads.

## Isolation

Presentation computation belongs in `packages/map-renderer` where possible so it remains independent from Next.js and Supabase.

Suggested responsibilities:

- `packages/map-renderer`: pure SVG-view-model/bounds helpers and their tests;
- `apps/player`: React SVG component and authenticated page composition;
- existing Gate 8B source/auth modules: unchanged except where composition requires reuse.

No React dependency is added to `packages/map-renderer` in this cut. The package exposes renderer-neutral calculations/data; React markup stays in `apps/player`.

## Security invariants

Gate 8C must preserve every Gate 8B invariant:

- request/client cannot choose `playerId`;
- no `service_role` or secret key in the player app;
- no `world_private` reads;
- no browser Supabase client;
- renderer consumes only `MapProjection`;
- no canonical IDs are added to projection contracts;
- no hidden geometry is reconstructed;
- recursive anti-leak guard remains before presentation;
- projection-source/database errors remain sanitized at user-facing boundaries.

The renderer is not a security boundary. Security must already be satisfied before render data reaches it.

## Testing strategy

Implementation follows TDD.

### Pure renderer-model tests

At minimum prove:

- bounds include every visible node and route point;
- ghost uncertainty radius expands bounds correctly;
- negative and fractional world coordinates are preserved;
- empty projection produces finite deterministic fallback bounds;
- single-point/same-axis geometry never produces invalid SVG dimensions;
- input projection is not mutated.

### Player React tests

At minimum prove:

- known node renders as known, not ghost;
- ghost uncertainty is represented;
- authorized labels render;
- missing labels do not invent text;
- route polylines render from projection geometry;
- SVG has an accessible name;
- empty projection renders the empty state.

### Page/composition tests

At minimum prove:

- missing session still redirects to login through the existing auth contract;
- projection is loaded using the resolved session `playerId`, not request input;
- valid projection reaches the renderer;
- source failure produces a sanitized unavailable state.

### Permanent CI

Gate 8C cannot close unless the branch passes the existing permanent CI:

- format;
- lint;
- typecheck;
- unit tests;
- build;
- database/RLS tests;
- PostgREST leakage smoke;
- real Player Auth A/B projection smoke;
- generated database type drift check.

## Explicitly out of scope

Gate 8C does not implement:

- pan/zoom/pinch;
- node detail panel/modal;
- private player notes;
- knowledge sharing;
- new route knowledge-state semantics;
- animated transitions;
- PixiJS/WebGPU;
- map editing from the player surface;
- client-side Supabase subscriptions/realtime;
- final visual polish;
- full mobile interaction QA or Playwright multi-browser coverage.

Those remain later Phase 8 / Phase 10 cuts.

## Gate 8C exit criteria

Gate 8C is technically closed when all of the following are true:

1. An authenticated player page loads its authorized real `MapProjection` server-side.
2. The projection is rendered as accessible SVG/React without browser-side world-data queries.
3. Known nodes, ghost uncertainty, routes, and authorized labels are visibly distinguishable/renderable from projection data only.
4. World-unit geometry is preserved through deterministic viewport calculation.
5. Empty and projection-unavailable states fail safely.
6. Gate 8B anti-leak/auth/RLS guarantees remain green.
7. Permanent `quality` and `database` CI jobs are both green on the final checkpoint commit.

Gate 8C does not close Gate 8 as a whole.