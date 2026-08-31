# Player Node Details 8E — Design

Status: Design approved in chat; written spec awaiting human review

Date: 2026-08-31

Base: Gate 8D final head `65a2ecd6961624210a6a85086eee68c139440a85`

Branch: `foundation/player-node-details-v0`

## 1. Scope

Gate 8E adds compact mouse/touch/keyboard node details to the player map without weakening the player projection security boundary.

This cut includes:

- a minimal typed player-safe node detail contract;
- strict parsing of `player_api.map_nodes.details`;
- propagation of authorized detail through `MapProjection`;
- a small client interaction island around the existing server-rendered SVG;
- node selection by projection-local ID only;
- a non-modal compact detail panel;
- mouse, touch, Enter, Space, Escape and explicit close behavior;
- larger interaction hit areas without changing visual/world geometry;
- focused security, accessibility and regression tests.

This cut does not include:

- confidence presentation semantics;
- origin/freshness/privacy presentation;
- private player notes;
- KnowledgeFact sharing;
- pan/zoom;
- route detail UI;
- canonical/world IDs in the player contract;
- new world-truth fetches from node interaction;
- full Playwright multi-browser/mobile coverage;
- PixiJS/WebGPU.

Gate 8 remains open after 8E.

## 2. Existing invariants preserved

8E must preserve all invariants established in 8A–8D:

1. The browser/request never chooses the authenticated player identity.
2. `apps/player` never receives service-role credentials.
3. The player path never queries or imports `world_private`.
4. The browser does not receive a Supabase client for this interaction.
5. `MapProjection` remains the anti-leak boundary consumed by presentation.
6. Projection IDs are player-local IDs; canonical source IDs remain absent.
7. Hidden geometry and identity are never reconstructed in the renderer.
8. Raw database/source errors never surface to player UI.
9. Fail-closed behavior remains mandatory.
10. Route precision rules from 8D remain unchanged.

## 3. Architectural choice

### 3.1 Selected approach

Keep `PlayerMapSvg` server-rendered and passive, then wrap it in a minimal client interaction island.

The server continues to:

1. resolve the authenticated session;
2. load only the authenticated player's `player_api` rows;
3. parse/build/validate `MapProjection`;
4. run the anti-leak guard;
5. render the SVG from the authorized projection.

The client island receives only the authorized node data necessary for selection and the compact detail panel. It does not receive canonical IDs, database clients, secrets, world truth, route data, or a callback that can fetch additional node truth.

### 3.2 Rejected alternatives

#### Entire SVG as a Client Component

Rejected for V0 because it moves the complete renderer into client JavaScript only to support a small interaction state. It increases hydration surface and couples rendering to interaction unnecessarily.

#### Server round-trip through URL/search params for every selected node

Rejected for V0 because every touch/click would become navigation/request latency despite all necessary authorized data already being present in the projection.

## 4. Player-safe node detail contract

Add a minimal typed contract in `packages/map-renderer`:

```ts
export interface ProjectionNodeDetail {
  category?: string;
  summary?: string;
}
```

`ProjectionNode` gains:

```ts
detail?: ProjectionNodeDetail;
```

No free-form detail object is exposed to presentation.

### 4.1 Allowed fields

#### `category`

- optional;
- trimmed non-empty string when present;
- maximum 80 characters;
- plain text only.

#### `summary`

- optional;
- trimmed non-empty string when present;
- maximum 600 characters;
- plain text only.

### 4.2 Explicitly absent in 8E

Node detail does not contain:

- canonical/source/world IDs;
- owner IDs;
- coordinates or geometry;
- approximate radius;
- raw confidence value for presentation;
- origin metadata;
- freshness timestamps;
- privacy flags;
- URLs;
- HTML;
- interpreted Markdown;
- arbitrary nested objects;
- `payload` or `secret_payload`;
- database metadata.

Future cuts may extend the typed contract only through an explicit reviewed design.

## 5. `player_api.map_nodes.details` semantics

The column already exists and remains the player-facing materialized storage for authorized detail.

Its semantic rule is strengthened:

> `player_api.map_nodes.details` is already-authorized player presentation data, not a mirror of canonical location payload.

8E must not introduce a trigger, query, mapper, or convenience function that automatically copies `world_private.locations.payload`, `world_private.locations.secret_payload`, or other canonical private fields into `player_api.map_nodes.details`.

Trusted server/system code may materialize approved detail for a player. Direct player writes remain forbidden by the existing `player_api` permissions/RLS model.

For V0 tests and seed data, authorized examples may be inserted explicitly into `player_api.map_nodes.details` to prove player-specific behavior.

## 6. Strict detail parsing

`apps/player/lib/map/player-projection-source.ts` remains the database adapter.

It will add `details` to the selected `map_nodes` columns and parse it with a dedicated strict function before constructing `PlayerProjectionNodeInput`.

Accepted input shapes:

```json
{}
```

```json
{ "category": "Vila" }
```

```json
{ "summary": "Um pequeno assentamento conhecido pelo personagem." }
```

```json
{
  "category": "Vila",
  "summary": "Um pequeno assentamento conhecido pelo personagem."
}
```

Any other shape is invalid, including:

- arrays;
- null;
- non-object values;
- extra keys;
- non-string values;
- empty/whitespace-only strings;
- over-limit strings;
- nested objects.

### 6.1 Failure policy

Malformed or unexpected `details` causes projection loading to fail closed.

The source must not silently discard unknown keys and continue. Silent partial acceptance would allow schema drift or accidental leakage to remain undetected.

The existing home model sanitizes projection-source failures to the generic unavailable state. Raw source/database errors remain hidden.

## 7. Projection construction and schema validation

`PlayerProjectionNodeInput` gains an optional typed `detail` field.

`buildPlayerMapProjection` copies only the already-parsed detail object into `ProjectionNode`.

`packages/world-schema` adds a strict `projectionNodeDetailSchema` and includes it as optional `detail` in `projectionNodeSchema`.

Because the schema remains `.strict()`, unexpected projection detail keys are rejected at the `MapProjection` boundary as a second line of defense.

The recursive anti-leak validator still runs after projection construction/parsing. It must inspect `detail` recursively exactly as it inspects every other projection object.

## 8. Anti-leak guard

The current recursive forbidden-key guard remains mandatory.

8E tests must prove that forbidden identifiers or secret-looking fields cannot be smuggled inside `detail`, including nested adversarial objects introduced before schema validation/guard tests.

No bypass is added for detail fields.

## 9. Server/client composition

### 9.1 Server responsibilities

`page.tsx` remains a Server Component and keeps session/projection loading unchanged.

It derives the authorized node list from the already-safe `MapProjection` and passes only those nodes to the interaction island.

The SVG remains rendered by `PlayerMapSvg` as server output.

The intended composition is equivalent to:

```tsx
<PlayerMapExplorer nodes={authorizedNodes}>
  <PlayerMapSvg projection={projection} />
</PlayerMapExplorer>
```

The exact component API may differ during implementation if tests show a cleaner equivalent, but the boundary must remain:

- interaction island owns selection only;
- server renderer owns map markup;
- no client data fetch;
- no client database dependency.

### 9.2 Client responsibilities

`PlayerMapExplorer` is the only new client-state owner for this cut.

Its primary state is equivalent to:

```ts
selectedNodeId: ProjectionItemId | null
```

Selection is ephemeral UI state only.

It is not persisted to:

- PostgreSQL;
- Supabase storage;
- `MapProjection`;
- PlayerKnowledge;
- ledger;
- URL/query state.

Reload clears selection.

## 10. Node interaction semantics

Each authorized SVG node receives presentation metadata containing only its projection-local ID, for example:

```html
data-player-node="true"
data-node-id="<projection-local-id>"
```

The ID is never a canonical location ID.

### 10.1 Activation

A node can be selected through:

- pointer click;
- touch-generated click/pointer activation;
- Enter while the node is focused;
- Space while the node is focused.

Activation resolves the ID only against the authorized `nodes` supplied to the client island.

If the ID is absent from that authorized list, the event is ignored/fails closed.

Unknown IDs never trigger a request.

### 10.2 Repeated activation

Activating the already-selected node keeps the same node selected. Selection does not toggle closed implicitly.

This avoids hidden behavior differences between pointer and keyboard use.

### 10.3 Closing

The panel closes through:

- an explicit `Fechar` button;
- Escape while focus is within the explorer interaction surface.

Escape must not trigger navigation or a database request.

Closing does not alter player knowledge.

## 11. SVG accessibility model

The current SVG is a static image (`role="img"`). Once nodes become interactive, the root must no longer present the entire interactive surface as a single opaque image.

8E will change the root to an accessible named interactive map region/group appropriate for inline SVG, while preserving a clear accessible name.

Each selectable node receives:

- keyboard focusability;
- `role="button"` or an equivalent accessible interactive semantic proven by tests;
- an accessible name derived only from authorized data.

### 11.1 Node accessible names

If an authorized label exists, use it in the accessible name.

If no authorized label exists, use a generic UI phrase such as `Local não identificado`.

This generic phrase is presentation copy, not inferred world knowledge. It must not encode sequence numbers, hidden kind, canonical identity, or guessed location semantics.

Ghost state may append a generic presentation qualifier such as `localização aproximada` without exposing radius or coordinates.

### 11.2 Focus behavior

Opening a non-modal panel does not automatically steal focus from the selected node.

This supports rapid keyboard exploration of multiple nodes.

Escape closes the panel while preserving the explorer's usable focus state. If implementation moves focus into the panel for any reason, closing must restore focus to the selected node using only its projection-local ID.

## 12. Non-modal compact detail panel

The panel is not a modal dialog.

It must not block interaction with the map.

Desktop layout: adjacent/lateral or lower panel inside the existing player map card.

Narrow/mobile layout: stacked below the map.

The exact CSS layout may adapt to the existing Foundation card, but V0 must avoid fixed overlays that obscure the map or require precision tapping to dismiss.

### 12.1 V0 content

The panel may display only:

- authorized node label, if present;
- generic unidentified-local fallback if label is absent;
- authorized `detail.category`, if present;
- knowledge state in a human-readable presentation form;
- authorized `detail.summary`, if present;
- generic `localização aproximada` indication for ghost nodes;
- explicit close control.

The panel does not display:

- coordinates;
- approximate radius number;
- raw confidence percentage/value;
- canonical IDs;
- source IDs;
- owner IDs;
- database timestamps;
- world payload.

Confidence/origin/freshness/privacy presentation belongs to a later cut.

## 13. Visual marker versus interaction target

The existing visible node mark remains small and tied to world geometry.

8E must not enlarge world geometry merely to create a comfortable touch target.

Instead, each selectable node receives a separate transparent/otherwise invisible interaction hit area.

Requirements:

- visual node size remains unchanged unless a small focus/selected presentation treatment is needed;
- hit area is presentation-only;
- hit area does not participate in viewport bounds;
- hit area does not represent uncertainty or knowledge precision;
- target should aim for approximately 44 × 44 CSS px where technically practical;
- hit area remains centered only on the already-authorized rendered node position;
- no hidden geometry is used to place it.

Implementation may use an SVG element with transparent fill/pointer behavior or an equivalent proven approach. The final mechanism must be tested for keyboard and pointer semantics.

## 14. Presentation states

Add explicit presentation-only states for:

- hover;
- focus-visible;
- selected.

These styles must not imply additional knowledge precision.

Known versus ghost styling from 8C remains intact.

Route knowledge styles from 8D remain intact.

## 15. No new network surface

Node selection must not introduce:

- `/api/node/:id`;
- server actions that retrieve more node truth;
- client Supabase queries;
- fetch/XHR triggered by selection;
- a request parameter containing a node identity for truth lookup.

The panel is entirely hydrated from already-authorized node data shipped with the rendered page.

This is a security requirement, not merely a performance optimization.

## 16. Player-specific detail behavior

Two players may receive different `details` for the same canonical location because `player_api.map_nodes` is player-specific.

8E must preserve this property end to end:

- Player A may receive category/summary X;
- Player B may receive category/summary Y or no detail;
- neither receives the other's row through RLS/PostgREST;
- neither can infer canonical linkage from player-local IDs.

## 17. Failure behavior

### Projection source failure

Malformed detail, malformed node row, database error, or projection validation error causes the existing sanitized unavailable state.

### Client selection failure

Unknown/missing projection-local ID is ignored and leaves the current valid state unchanged or closed. It never requests more data.

### Detail absent

A valid node with no detail remains fully selectable. The panel renders only the authorized/generic presentation fields available.

### Label absent

No label is synthesized from projection ID, node kind, database data, or canonical data. Only the generic unidentified-local UI copy may be used.

## 18. Testing strategy

Implementation follows TDD.

### 18.1 Projection/domain tests

Prove:

1. authorized `category` and `summary` are copied into `ProjectionNode.detail`;
2. absent detail stays absent or empty according to the finalized builder contract;
3. builder does not synthesize detail;
4. existing route filtering and ghost behavior remain unchanged.

### 18.2 World-schema tests

Prove:

1. valid detail parses;
2. unknown detail keys fail;
3. nested/untyped detail fails;
4. over-limit/empty values fail according to the final schema;
5. all existing projection fixtures still validate when no detail is present.

### 18.3 Projection source tests

Prove:

1. `details` is selected from `player_api.map_nodes`;
2. `{}` is valid;
3. category-only, summary-only, and both fields are valid;
4. arrays/null/non-object values fail;
5. extra keys fail closed;
6. over-limit/whitespace strings fail closed;
7. raw errors remain sanitized by the home model;
8. no world/private query is introduced.

### 18.4 Anti-leak tests

Prove forbidden keys remain rejected when attempted inside detail, including:

- canonical/source/world IDs;
- secret payload aliases;
- owner identity aliases.

The guard must remain recursive.

### 18.5 Renderer tests

Prove:

1. authorized projection-local node ID is rendered as interaction metadata;
2. canonical IDs are absent;
3. existing known/ghost geometry remains exact to supplied projection values;
4. hit areas do not alter viewport calculations;
5. unlabeled ghost does not expose projection ID as visible/accessibility identity;
6. route rendering remains unchanged.

### 18.6 Client interaction tests

Use the project's existing unit/component test stack; add DOM interaction tooling only if already available or if the implementation plan justifies the smallest necessary test dependency.

Prove:

1. pointer/click selects an authorized node;
2. Enter selects focused node;
3. Space selects focused node;
4. selecting another node updates the same panel;
5. repeated activation does not toggle closed;
6. explicit close closes;
7. Escape closes;
8. unknown `data-node-id` does not select or fetch;
9. node with no detail still opens a valid compact panel;
10. ghost without label uses only generic UI copy;
11. no network request is emitted by selection;
12. accessible state/name attributes are coherent with selection.

### 18.7 Database/PostgREST/Auth regression

Prove:

1. Player A sees only A's `map_nodes.details`;
2. Player B sees only B's `map_nodes.details`;
3. canonical location payload/secret payload does not appear automatically in player rows;
4. direct PostgREST remains player-isolated;
5. permanent Auth A/B smoke remains green;
6. route knowledge 8D smokes remain green;
7. existing DB/RLS suite remains green;
8. generated database types remain drift-free.

No new database column is required merely for 8E because `player_api.map_nodes.details` already exists.

## 19. Expected file areas

The implementation plan should verify exact paths before edits, but expected touched areas are:

- `packages/map-renderer/src/projection.ts`
- `packages/map-renderer/src/player-projection.ts`
- projection/builder safety tests
- `packages/world-schema/src/schemas.ts`
- world-schema tests
- `apps/player/lib/map/player-projection-source.ts`
- projection source tests
- `apps/player/app/player-map-svg.tsx`
- renderer tests
- new minimal client explorer/detail component and tests under `apps/player/app/`
- `apps/player/app/page.tsx`
- `apps/player/app/globals.css`
- seed/DB smoke fixtures only if needed to prove player-specific detail behavior
- status/progress docs after technical evidence is green.

## 20. Security acceptance criteria

8E cannot close unless all are true:

1. Clicking/touching/focusing a node never grants more data than the initial authorized page projection.
2. Client selection uses only projection-local IDs.
3. No canonical/world/source ID enters the detail contract.
4. No private canonical payload is automatically copied into player detail.
5. `details` is parsed strictly and fails closed on unexpected shape.
6. `MapProjection` schema remains strict.
7. Recursive anti-leak validation remains active.
8. Direct PostgREST remains safe if React/client JavaScript is bypassed.
9. Player A/B details remain isolated.
10. Renderer/client code does not query `world_private` or use service-role credentials.
11. Existing 8B–8D security smokes remain green.

## 21. UX/accessibility acceptance criteria

8E cannot close unless all are true:

1. Node can be activated with pointer/touch, Enter, and Space.
2. Node is keyboard focusable with visible focus state.
3. Selection is visibly distinguishable without changing knowledge precision.
4. Panel is non-modal and usable on narrow layouts.
5. Explicit close exists.
6. Escape closes selection.
7. Node without detail remains usable.
8. Unlabeled node does not leak an identifier as its display/accessibility name.
9. Interaction target is larger than the visible mark without changing world geometry.
10. Existing map empty/unavailable states remain correct.

## 22. Verification gate

Final branch evidence must include, on one final head:

- format check green;
- lint green;
- typecheck green;
- all unit/component tests green;
- production build green;
- database/RLS tests green;
- PostgREST leakage smoke green;
- real Auth A/B smoke green;
- 8D route leakage guarantees still green;
- generated database types with no drift.

Only then may 8E be marked technically green, status docs updated, Drive synchronized, and a dedicated draft/open/unmerged PR created.

No merge or deploy is part of 8E closure.

## 23. Next cut after 8E

After 8E is green, the next Phase 8 cut should extend the already-safe detail/presentation surface with confidence/origin/freshness/privacy semantics, without rebuilding node selection or weakening `MapProjection`.
