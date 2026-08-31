# Player Node Details 8E — Design

Status: Design approved in chat; written spec awaiting human review

Date: 2026-08-31

Base: Gate 8D final head `65a2ecd6961624210a6a85086eee68c139440a85`

Branch: `foundation/player-node-details-v0`

## 1. Scope

Gate 8E adds compact mouse/touch/keyboard node details to the player map without weakening the player projection security boundary.

Included:

- minimal typed player-safe node detail contract;
- strict parsing of `player_api.map_nodes.details`;
- propagation of authorized detail through `MapProjection`;
- a minimal client interaction island around the server-rendered SVG;
- node selection by projection-local ID only;
- a non-modal compact detail panel;
- pointer/touch, Enter, Space, Escape and explicit close behavior;
- larger interaction hit areas without changing world geometry;
- security, accessibility and regression tests.

Excluded:

- confidence/origin/freshness/privacy presentation;
- private player notes;
- KnowledgeFact sharing;
- pan/zoom;
- route detail UI;
- canonical/world/source IDs in player contracts;
- any node-selection fetch/server action/client Supabase query;
- full Playwright multi-browser/mobile coverage;
- PixiJS/WebGPU.

Gate 8 remains open after 8E.

## 2. Existing invariants preserved

8E preserves all 8A–8D invariants:

1. Browser/request never chooses authenticated player identity.
2. `apps/player` never receives service-role credentials.
3. Player path never queries/imports `world_private`.
4. No browser Supabase client is introduced for this interaction.
5. `MapProjection` remains the anti-leak boundary.
6. Player-facing IDs remain projection-local.
7. Renderer never reconstructs hidden identity/geometry.
8. Raw source/database errors never reach player UI.
9. Fail-closed behavior is mandatory.
10. Route precision rules from 8D remain unchanged.

## 3. Architecture

### 3.1 Selected approach

Keep `PlayerMapSvg` server-rendered and passive. Add a minimal client `PlayerMapExplorer` around it.

Server flow remains:

1. resolve authenticated session;
2. load only that player's `player_api` rows;
3. parse/build/validate `MapProjection`;
4. run recursive anti-leak guard;
5. render SVG from the authorized projection.

The client island receives only the authorized node list needed for local selection/panel rendering. It receives no canonical IDs, route data, DB client, secrets, world truth, or callback capable of fetching more truth.

Intended composition is equivalent to:

```tsx
<PlayerMapExplorer nodes={authorizedNodes}>
  <PlayerMapSvg projection={projection} />
</PlayerMapExplorer>
```

The exact prop shape may be refined in the implementation plan, but the boundary may not change.

### 3.2 Rejected alternatives

**Entire SVG as Client Component:** rejected because a small selection state does not justify hydrating/re-owning the full renderer.

**Server round-trip per selected node:** rejected because all authorized V0 detail is already in the initial projection; extra requests add latency and a new identity-bearing network surface.

## 4. Player-safe detail contract

Add:

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

No free-form detail object reaches presentation.

### 4.1 Field rules

`category`:

- optional;
- string;
- trimmed on input;
- non-empty after trim;
- maximum 80 characters after trim;
- plain text.

`summary`:

- optional;
- string;
- trimmed on input;
- non-empty after trim;
- maximum 600 characters after trim;
- plain text.

An empty DB object `{}` normalizes to no projection detail (`detail` omitted).

No detail field may contain canonical/source/world/owner IDs, coordinates, geometry, radius, raw confidence presentation, origin/freshness/privacy metadata, URLs, HTML, interpreted Markdown, arbitrary nested objects, payloads, secret payloads, or database metadata.

## 5. Semantics of `player_api.map_nodes.details`

The existing `details jsonb` column is already-authorized player presentation data. It is not a mirror of canonical location payload.

8E must not add any trigger/query/mapper/helper that automatically copies:

- `world_private.locations.payload`;
- `world_private.locations.secret_payload`;
- any other canonical private payload

into `player_api.map_nodes.details`.

Trusted system/server code may explicitly materialize approved detail for a player. Direct player writes remain forbidden by existing permissions/RLS.

Seed/tests may explicitly insert safe player-specific detail fixtures.

## 6. Strict source parsing

`apps/player/lib/map/player-projection-source.ts` remains the DB adapter.

It adds `details` to the `map_nodes` SELECT and parses with a dedicated strict parser before constructing `PlayerProjectionNodeInput`.

Valid DB shapes are exactly:

```json
{}
```

```json
{ "category": "Vila" }
```

```json
{ "summary": "Assentamento conhecido pelo personagem." }
```

```json
{
  "category": "Vila",
  "summary": "Assentamento conhecido pelo personagem."
}
```

Invalid:

- `null`;
- arrays;
- non-object values;
- extra keys;
- non-string values;
- whitespace-only strings;
- over-limit strings;
- nested objects.

Valid strings are normalized by trimming before being placed in the projection.

### 6.1 Failure policy

Unexpected/malformed `details` fails the entire projection load closed.

The source must not silently discard unknown keys or salvage partial detail. Existing home-model sanitization converts this to the generic unavailable UI without exposing raw source errors.

## 7. Projection construction and schema

`PlayerProjectionNodeInput` gains optional typed `detail`.

`buildPlayerMapProjection`:

- copies only parsed detail;
- omits `detail` when the normalized detail object is empty;
- never synthesizes category/summary.

`packages/world-schema` adds strict `projectionNodeDetailSchema` and optional `detail` on `projectionNodeSchema`.

The schema stays `.strict()`. Unknown projection-detail keys fail before presentation.

The recursive anti-leak guard still runs over the resulting projection, including `detail`.

## 8. Anti-leak guard

No detail-specific bypass is allowed.

Tests must prove forbidden identifier/payload aliases remain rejected if adversarial test values attempt to place them under `detail` or nested below it. The strict schema blocks arbitrary nesting in real projections; direct guard tests remain a defense-in-depth proof.

## 9. Server/client ownership

### Server

`page.tsx` remains a Server Component. Authentication and projection loading stay unchanged.

It derives `authorizedNodes = projection.items.filter(item => item.kind === 'node')` from the already-safe projection and supplies only those nodes to the client explorer.

`PlayerMapSvg` remains server-rendered.

### Client

`PlayerMapExplorer` owns only ephemeral selection state:

```ts
selectedNodeId: ProjectionItemId | null
```

Selection is not persisted to DB, storage, `MapProjection`, PlayerKnowledge, ledger, or URL. Reload clears it.

The island uses event delegation over the server-rendered SVG. It does not clone/rebuild map geometry.

## 10. Node interaction metadata

Each authorized SVG node group exposes only presentation-safe metadata:

```html
data-player-node="true"
data-node-id="<projection-local-id>"
```

No canonical ID is present.

The interactive group is keyboard focusable and uses `role="button"`.

## 11. Activation and selection

Selection can be activated by:

- pointer/click (including touch-generated activation);
- Enter on focused node;
- Space on focused node.

The client extracts `data-node-id` and resolves it against the authorized `nodes` array supplied to `PlayerMapExplorer`.

If the ID is missing or not in that authorized set:

- ignore the event;
- preserve the current valid selection exactly as-is;
- do not issue any request.

Activating the already-selected node keeps it selected. Selection never toggles closed implicitly.

## 12. Selected-state reflection without client-rendering the SVG

Because the SVG remains server-rendered, `PlayerMapExplorer` reflects selection into existing node DOM attributes rather than converting `PlayerMapSvg` into a Client Component.

On selection change, the island updates only authorized node elements within its own root:

- selected node: `data-selected="true"`, `aria-pressed="true"`;
- other authorized nodes: remove/false selected state, `aria-pressed="false"`.

This DOM synchronization is presentation-only. It may never alter geometry, labels, IDs, or hidden data.

The implementation must scope DOM lookup to the explorer root and match only the authorized projection-local IDs already held by the client.

## 13. Closing/focus behavior

Panel closes through:

- explicit `Fechar` button;
- Escape while focus is inside the explorer.

Opening the non-modal panel does not steal focus from the selected node.

Escape closes while leaving the focused node usable.

If the user closes through the panel button, focus returns to the previously selected node using only its projection-local ID, provided that node still exists in the explorer DOM. If it no longer exists, focus falls back to the explorer region without requesting data.

Closing never changes PlayerKnowledge.

## 14. SVG accessibility model

The root SVG changes from static `role="img"` to:

```html
role="group"
aria-label="Mapa de conhecimento do jogador"
```

This communicates a named interactive group rather than one opaque image.

Each selectable node group uses:

- `role="button"`;
- `tabIndex=0`;
- `aria-pressed="false|true"` synchronized by the client island;
- an accessible name derived only from authorized projection data/generic UI copy.

### Node accessible name

If authorized label exists: use it.

If label is absent: use exactly the generic UI identity `Local não identificado`.

If node is a ghost, the accessible name may append `, localização aproximada`.

The fallback must not include projection ID, sequence number, hidden kind, guessed name, coordinates, or canonical identity.

## 15. Compact non-modal panel

The panel is not a dialog/modal and does not block map interaction.

Desktop: adjacent/lateral or lower area inside the player map card.

Narrow/mobile: stacked below the map.

No fixed overlay is required in V0.

Panel content is limited to:

- authorized label, or generic `Local não identificado`;
- authorized `detail.category`;
- human-readable knowledge state;
- authorized `detail.summary`;
- generic `Localização aproximada` indicator for ghost nodes;
- close button.

Do not display coordinates, approximate radius number, raw confidence value/percentage, canonical/source/owner IDs, DB timestamps, or world payload.

## 16. Visual marker versus hit target

Visible node geometry remains tied to world units and retains existing known/ghost semantics.

A separate presentation-only hit element is centered on the already-authorized rendered node position.

Preferred V0 mechanism to verify during implementation:

- an additional SVG circle inside the node group;
- transparent fill/stroke presentation;
- non-scaling stroke;
- pointer-events configured on the hit shape;
- effective target aiming at approximately 44 × 44 CSS px while leaving the visible mark unchanged.

If browser/SVG behavior in tests makes that mechanism unreliable, the implementation plan may choose an equivalent minimal hit-target technique, but it may not move/reconstruct node position or enlarge viewport bounds.

The hit element:

- is excluded from viewport calculation;
- represents no world geometry/uncertainty;
- cannot use hidden coordinates;
- bubbles activation to the same authorized node group.

## 17. Presentation states

Add presentation-only styles for:

- hover;
- `focus-visible`;
- selected.

Selected/focus styling must not imply increased knowledge precision.

Known/ghost styling from 8C and route-state styling from 8D remain intact.

## 18. No new network surface

Node interaction must not introduce:

- `/api/node/:id`;
- server action for additional node truth;
- client Supabase query;
- fetch/XHR on select;
- truth lookup keyed by node ID.

The panel is fully hydrated from authorized nodes already shipped with the page.

This is a security requirement.

## 19. Player-specific detail

Two players may receive different safe details for the same canonical location because `player_api.map_nodes` is owner-scoped.

End-to-end proof must allow:

- Player A: detail X;
- Player B: detail Y or absent;
- A cannot read B's row;
- B cannot read A's row;
- local projection IDs do not reveal canonical linkage.

## 20. Failure behavior

**Malformed source/detail:** projection fails closed; generic map unavailable UI.

**Unknown client node ID:** ignored; current valid selection remains unchanged; zero network activity.

**Valid node with no detail:** still selectable; panel uses only available authorized/generic fields.

**Unlabeled node:** never derive visible/accessibility identity from projection ID, kind, DB metadata, or canonical data.

## 21. TDD test requirements

### Projection/builder

Prove:

1. valid category/summary reaches `ProjectionNode.detail`;
2. `{}`/absent detail produces omitted `detail`;
3. builder synthesizes nothing;
4. route filtering and ghost behavior remain unchanged.

### World-schema

Prove:

1. valid detail parses;
2. unknown keys fail;
3. nested/untyped values fail;
4. whitespace-only/over-limit fields fail;
5. existing no-detail projections still parse.

### Projection source

Prove:

1. `details` is selected from `player_api.map_nodes`;
2. `{}`, category-only, summary-only and both valid;
3. trim normalization is deterministic;
4. null/array/non-object fail;
5. extra key fails closed;
6. invalid lengths/whitespace fail closed;
7. raw errors remain sanitized by home model;
8. no private/world query is introduced.

### Anti-leak

Prove forbidden canonical/source/world/owner/payload aliases remain rejected under adversarial detail objects. Guard stays recursive.

### Server renderer

Prove:

1. projection-local node ID appears only as interaction metadata;
2. canonical IDs are absent;
3. root uses named `role="group"`;
4. nodes expose button/focus semantics and generic safe fallback naming;
5. supplied known/ghost geometry is unchanged;
6. hit element does not participate in viewport calculation;
7. route rendering remains unchanged.

### Client explorer

Prove:

1. click selects authorized node;
2. Enter selects;
3. Space selects;
4. another node updates same panel;
5. repeated activation stays selected;
6. `data-selected`/`aria-pressed` synchronize correctly;
7. close button closes and restores focus to selected node when available;
8. Escape closes without stealing/breaking node focus;
9. unknown ID leaves current selection unchanged;
10. unknown ID emits no fetch/network request;
11. no-detail node opens a valid panel;
12. unlabeled ghost uses only generic safe UI copy.

### Database/PostgREST/Auth regression

Prove:

1. A sees only A's node detail;
2. B sees only B's node detail;
3. canonical payload/secret payload is not automatically reflected in details;
4. direct PostgREST stays owner-isolated;
5. permanent Auth A/B smoke stays green;
6. 8D route leakage smokes stay green;
7. DB/RLS tests stay green;
8. generated DB types have no drift.

No DB column is required solely for 8E because `player_api.map_nodes.details` already exists.

## 22. Expected implementation areas

Implementation plan must verify exact files, but expected areas are:

- `packages/map-renderer/src/projection.ts`;
- `packages/map-renderer/src/player-projection.ts` + tests;
- `packages/map-renderer/src/projection-safety*` tests;
- `packages/world-schema/src/schemas.ts` + tests;
- `apps/player/lib/map/player-projection-source.ts` + tests;
- `apps/player/app/player-map-svg.tsx` + tests;
- new minimal `apps/player/app/player-map-explorer.tsx` + interaction tests;
- `apps/player/app/page.tsx`;
- `apps/player/app/globals.css`;
- seed/DB smoke fixtures only where required for player-specific detail proof;
- status/progress docs only after technical green evidence.

The implementation plan must inspect the existing test dependencies before adding any DOM-testing package. No dependency is added merely because the design names an interaction test.

## 23. Security acceptance gate

8E cannot close unless:

1. node interaction grants no data beyond initial authorized projection;
2. client selection uses only projection-local IDs;
3. no canonical/world/source ID enters detail contract;
4. no canonical private payload is auto-copied to detail;
5. details parser is strict/fail-closed;
6. `MapProjection` schema remains strict;
7. recursive anti-leak guard remains active;
8. direct PostgREST remains safe if React is bypassed;
9. A/B detail isolation is proven;
10. renderer/client does not query `world_private` or use service role;
11. 8B–8D permanent security smokes remain green.

## 24. UX/accessibility acceptance gate

8E cannot close unless:

1. pointer/touch, Enter and Space activate nodes;
2. nodes are keyboard focusable with visible focus state;
3. selected state is visible and reflected in `aria-pressed`;
4. panel is non-modal and works in narrow layout;
5. explicit close exists;
6. Escape closes;
7. no-detail node remains usable;
8. unlabeled node never leaks an identifier as name;
9. hit target is larger than visible mark without changing world geometry/viewport;
10. existing empty/unavailable states remain correct.

## 25. Verification gate

One final head must pass:

- format check;
- lint;
- typecheck;
- all unit/component tests;
- production build;
- DB/RLS tests;
- PostgREST leakage smoke;
- real Auth A/B smoke;
- 8D route leakage guarantees;
- generated DB types no drift.

Only after that may status docs/Drive be synchronized and a dedicated PR be created as draft/open/unmerged.

No merge or deploy belongs to 8E closure.

## 26. Next cut

After 8E is green, the next Phase 8 cut extends this same safe detail/presentation surface with confidence/origin/freshness/privacy semantics. Node selection must not be rebuilt or given additional world-truth authority.
