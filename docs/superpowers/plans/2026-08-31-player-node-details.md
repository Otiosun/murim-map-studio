# Player Node Details 8E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact, mouse/touch/keyboard-accessible player node details without introducing any new world-truth lookup or weakening `MapProjection` as the anti-leak boundary.

**Architecture:** Keep session resolution, projection loading and SVG rendering server-side. Extend the player-safe projection with a strict `ProjectionNodeDetail`, derive a geometry-free node detail view model on the server, and wrap the existing server-rendered SVG in one minimal client island that owns only ephemeral selection state and a non-modal panel. `player_api.map_nodes.details` is parsed as already-authorized presentation data; malformed data fails closed.

**Tech Stack:** Next.js 16.3.3, React 19.2.7, TypeScript 6.0.2, Zod 4.4.3, Vitest 4.1.11, jsdom 30.0.1 for client DOM tests, Supabase CLI 2.115.0/PostgreSQL/PostGIS, pnpm 11.21.0.

**Spec:** `docs/superpowers/specs/2026-08-31-player-node-details-design.md`

## Global Constraints

- Base branch/head for 8E is `foundation/player-route-knowledge-v0` at `65a2ecd6961624210a6a85086eee68c139440a85`.
- Work only on `foundation/player-node-details-v0`; do not merge or deploy.
- `MapProjection` remains the only player presentation contract carrying map knowledge.
- Browser/request identity never selects `playerId`; `page.tsx` continues using the authenticated server-side session.
- No service-role credential, browser Supabase client, `world_private` import/query, server action, node truth endpoint, fetch/XHR, or canonical/world/source ID is added to node selection.
- `player_api.map_nodes.details` is already-authorized player presentation data; never copy `world_private.locations.payload` or `secret_payload` into it automatically.
- Allowed node detail fields are only `category?: string` and `summary?: string`.
- `category` is trimmed, non-empty when present, maximum 80 characters.
- `summary` is trimmed, non-empty when present, maximum 600 characters.
- Detail is plain text only; no HTML, interpreted Markdown, URL contract, coordinates, geometry, uncertainty radius, raw confidence presentation, origin/freshness/privacy, or arbitrary nested object.
- Malformed/unknown detail keys fail closed; do not silently discard them.
- `{}` in `player_api.map_nodes.details` becomes no `ProjectionNode.detail` rather than an empty presentation object.
- Client island receives only geometry-free authorized node detail view models, not the complete projection or route data.
- Selection state is ephemeral and local; it is not persisted to DB, URL, PlayerKnowledge, ledger, or `MapProjection`.
- Unknown projection-local node IDs are ignored and never cause a request.
- Existing route precision rules, ghost geometry, route rendering, empty/unavailable behavior, A/B RLS isolation and anti-leak guards must remain unchanged.
- Full Playwright multi-browser/mobile coverage stays deferred to Phase 10.
- No new migration is required for 8E because `player_api.map_nodes.details jsonb` already exists.

---

## File Map

### Create

- `apps/player/lib/map/player-node-detail-model.ts` — geometry-free client-safe node view model, display-name/accessible-name helpers, human knowledge-state labels.
- `apps/player/lib/map/player-node-detail-model.test.ts` — proves projection-to-client minimization and presentation copy.
- `apps/player/app/player-map-explorer.tsx` — the only new Client Component; owns `selectedNodeId`, delegated activation, `aria-pressed` synchronization, focus restoration and compact panel.
- `apps/player/app/player-map-explorer.test.tsx` — jsdom interaction tests for pointer, keyboard, close, unknown IDs and zero network calls.

### Modify

- `packages/map-renderer/src/projection.ts` — `ProjectionNodeDetail`, shared max-length constants, optional `ProjectionNode.detail`.
- `packages/map-renderer/src/player-projection.ts` — accept/copy typed detail only.
- `packages/map-renderer/src/player-projection.test.ts` — TDD for authorized detail propagation and absence behavior.
- `packages/map-renderer/src/projection-safety.test.ts` — explicit adversarial forbidden-key attempts inside detail.
- `packages/world-schema/src/schemas.ts` — strict Zod node-detail schema.
- `packages/world-schema/src/schemas.test.ts` — valid/invalid detail boundary tests.
- `apps/player/lib/map/player-projection-source.ts` — select and strictly parse `details`.
- `apps/player/lib/map/player-projection-source.test.ts` — adapter validation/fail-closed tests and exact select coverage.
- `apps/player/app/player-map-svg.tsx` — accessible interactive node markup and separate hit target; still Server Component.
- `apps/player/app/player-map-svg.test.tsx` — server markup/security regression tests.
- `apps/player/app/page.tsx` — derive minimal authorized node view models and compose `PlayerMapExplorer` around the server SVG.
- `apps/player/app/globals.css` — non-modal responsive panel plus hover/focus/selected/hit-target presentation.
- `package.json` / `pnpm-lock.yaml` — add only `jsdom@30.0.1` as a root dev dependency for Vitest DOM tests.
- `supabase/seed.sql` — replace old free-form `details.source/precision` fixtures with strict `category/summary` player-specific fixtures.
- `supabase/tests/database/rls.test.sql` — assert detail rows are player-specific and direct authenticated mutation remains denied.
- `scripts/database-api-leakage-test.mjs` — direct PostgREST assertions for A/B detail isolation and absence of canonical/private content.
- `scripts/player-auth-projection-test.mjs` — same assertions using real Auth sessions.
- `docs/PLAYER_NODE_DETAILS_V0_STATUS.md` — final 8E checkpoint after functional CI is green.
- `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` — add 8E closure only after functional CI is green.

---

### Task 1: Add the typed node-detail projection contract

**Files:**
- Modify: `packages/map-renderer/src/projection.ts`
- Modify: `packages/map-renderer/src/player-projection.ts`
- Modify: `packages/map-renderer/src/player-projection.test.ts`
- Modify: `packages/world-schema/src/schemas.ts`
- Modify: `packages/world-schema/src/schemas.test.ts`

**Interfaces:**
- Produces: `PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH = 80`, `PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH = 600`, `ProjectionNodeDetail`, `ProjectionNode.detail?: ProjectionNodeDetail`, `PlayerProjectionNodeInput.detail?: ProjectionNodeDetail`.
- Consumed by: projection source, node view model, schema validation and interaction panel.

- [ ] **Step 1: Write failing map-renderer tests for detail propagation**

Add focused cases to `player-projection.test.ts` using an authorized node input:

```ts
it('copies only the supplied typed node detail into the projection', () => {
  const projection = buildPlayerMapProjection({
    mapKey: 'player-map',
    generatedAt: '2026-08-31T18:00:00.000Z',
    nodes: [
      {
        projectionId: 'node:known',
        kind: 'settlement',
        label: 'Vila Qinghe',
        knowledgeState: 'confirmed',
        confidence: 1,
        role: 'known',
        position: { x: 100, y: 120 },
        detail: { category: 'Vila', summary: 'Um assentamento conhecido.' },
      },
    ],
    routes: [],
  });

  expect(projection.items[0]).toMatchObject({
    kind: 'node',
    detail: { category: 'Vila', summary: 'Um assentamento conhecido.' },
  });
});

it('does not synthesize detail when none is supplied', () => {
  const projection = buildPlayerMapProjection({
    mapKey: 'player-map',
    generatedAt: '2026-08-31T18:00:00.000Z',
    nodes: [
      {
        projectionId: 'node:known',
        kind: 'settlement',
        label: 'Vila Qinghe',
        knowledgeState: 'confirmed',
        confidence: 1,
        role: 'known',
        position: { x: 100, y: 120 },
      },
    ],
    routes: [],
  });

  expect(projection.items[0]).not.toHaveProperty('detail');
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
pnpm vitest run packages/map-renderer/src/player-projection.test.ts
```

Expected: FAIL because `detail` is not part of the input/projection contract yet.

- [ ] **Step 3: Add the minimal typed contract and builder copy**

In `projection.ts` add:

```ts
export const PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH = 80;
export const PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH = 600;

export interface ProjectionNodeDetail {
  category?: string;
  summary?: string;
}
```

Add `detail?: ProjectionNodeDetail` to `ProjectionNode`.

In `player-projection.ts`, import `ProjectionNodeDetail`, add `detail?: ProjectionNodeDetail` to `PlayerProjectionNodeInput`, and copy it only when present:

```ts
...(input.detail === undefined ? {} : { detail: input.detail }),
```

Do not put detail inside `metadata`.

- [ ] **Step 4: Add failing strict world-schema tests**

Add cases to `packages/world-schema/src/schemas.test.ts` that prove:

```ts
expect(
  parseMapProjection({
    projectionVersion: 1,
    mapKey: 'player-map',
    generatedAt: '2026-08-31T18:00:00.000Z',
    items: [
      {
        id: 'node-safe',
        kind: 'node',
        metadata: {},
        position: { x: 1, y: 2 },
        role: 'known',
        symbolKey: 'location:settlement',
        detail: { category: '  Vila  ', summary: '  Conhecida pelo jogador.  ' },
      },
    ],
  }).items[0],
).toMatchObject({
  detail: { category: 'Vila', summary: 'Conhecida pelo jogador.' },
});
```

Also reject `detail: { category: 'Vila', canonicalId: 'x' }`, nested objects, whitespace-only strings, 81-character category and 601-character summary.

- [ ] **Step 5: Run schema tests and confirm RED**

```bash
pnpm vitest run packages/world-schema/src/schemas.test.ts
```

Expected: FAIL because `projectionNodeSchema` currently rejects the new `detail` field.

- [ ] **Step 6: Implement the strict Zod detail schema**

In `schemas.ts`, import the two max-length constants at runtime from `@murim/map-renderer` and add:

```ts
const projectionNodeDetailSchema = z
  .object({
    category: z.string().trim().min(1).max(PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH).optional(),
    summary: z.string().trim().min(1).max(PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH).optional(),
  })
  .strict();
```

Add `detail: projectionNodeDetailSchema.optional()` to `projectionNodeSchema`.

- [ ] **Step 7: Run both focused suites and confirm GREEN**

```bash
pnpm vitest run packages/map-renderer/src/player-projection.test.ts packages/world-schema/src/schemas.test.ts
```

Expected: PASS with existing route/ghost tests unchanged.

- [ ] **Step 8: Commit**

```bash
git add packages/map-renderer/src/projection.ts packages/map-renderer/src/player-projection.ts packages/map-renderer/src/player-projection.test.ts packages/world-schema/src/schemas.ts packages/world-schema/src/schemas.test.ts
git commit -m "feat: add player-safe node detail contract"
```

---

### Task 2: Strictly parse `player_api.map_nodes.details` and preserve fail-closed behavior

**Files:**
- Modify: `apps/player/lib/map/player-projection-source.ts`
- Modify: `apps/player/lib/map/player-projection-source.test.ts`
- Modify: `packages/map-renderer/src/projection-safety.test.ts`

**Interfaces:**
- Consumes: `ProjectionNodeDetail` and the shared 80/600 length constants.
- Produces: strict adapter behavior where `{}` => `undefined`; valid fields are trimmed; every extra/invalid shape throws `Invalid player map node detail`.

- [ ] **Step 1: Rewrite the source test fixture to make detail explicit and safe by default**

Change the default node fixture from the currently ignored secret-shaped object to:

```ts
details: {},
```

Extend fake query call recording to include the selected `columns` string so the test can prove `details` is actually requested.

- [ ] **Step 2: Add failing valid-detail source tests**

Add tests for `{}`, category-only, summary-only and both fields. Example:

```ts
const { source } = createSource({
  map_nodes: [
    nodeRow({
      details: {
        category: '  Vila  ',
        summary: '  Conhecida pelo jogador.  ',
      },
    }),
  ],
  map_routes: [],
});

await expect(source.load(playerId)).resolves.toMatchObject({
  items: [
    {
      kind: 'node',
      detail: { category: 'Vila', summary: 'Conhecida pelo jogador.' },
    },
  ],
});
```

Assert the node SELECT string contains `details`.

- [ ] **Step 3: Add failing invalid-detail tests**

Use `it.each` for:

```ts
[
  null,
  [],
  'text',
  { category: '' },
  { category: ' '.repeat(4) },
  { category: 'x'.repeat(81) },
  { summary: 'x'.repeat(601) },
  { category: 123 },
  { summary: { nested: true } },
  { category: 'Vila', source_location_id: 'forbidden' },
]
```

Each must reject with `Invalid player map node detail`.

- [ ] **Step 4: Run the source test and confirm RED**

```bash
pnpm vitest run apps/player/lib/map/player-projection-source.test.ts
```

Expected: FAIL because the adapter does not select/parse `details` yet.

- [ ] **Step 5: Implement one dedicated strict parser**

Add a pure helper in `player-projection-source.ts` with this contract:

```ts
function readNodeDetail(value: unknown): ProjectionNodeDetail | undefined
```

Implementation rules:

```ts
if (!isRecord(value)) throw new Error('Invalid player map node detail');
const keys = Object.keys(value);
if (keys.some((key) => key !== 'category' && key !== 'summary')) {
  throw new Error('Invalid player map node detail');
}
```

For each present field, require a string, trim it, require length 1..shared max. Return `undefined` when neither field exists; otherwise return only `{ category?, summary? }`.

Add `details` to the node SELECT string, parse before returning `PlayerProjectionNodeInput`, and spread `detail` only when defined.

Do not parse route `details` in 8E.

- [ ] **Step 6: Add explicit detail anti-leak guard tests**

In `projection-safety.test.ts`, add a test that places each of these keys directly under a malicious `detail` object passed as `unknown`:

```ts
['canonicalId', 'sourceLocationId', 'worldId', 'ownerUserId', 'secretPayload']
```

Assert `assertPlayerProjectionSafe` throws the existing forbidden-key error. No guard implementation change should be needed.

- [ ] **Step 7: Run source + guard tests and confirm GREEN**

```bash
pnpm vitest run apps/player/lib/map/player-projection-source.test.ts packages/map-renderer/src/projection-safety.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/player/lib/map/player-projection-source.ts apps/player/lib/map/player-projection-source.test.ts packages/map-renderer/src/projection-safety.test.ts
git commit -m "feat: validate player node details at projection source"
```

---

### Task 3: Make the database fixture prove player-specific sanitized details

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `scripts/database-api-leakage-test.mjs`
- Modify: `scripts/player-auth-projection-test.mjs`

**Interfaces:**
- Produces deterministic safe `player_api.map_nodes.details` fixtures consumed by Task 2 and permanent DB/API smokes.
- No schema/migration change.

- [ ] **Step 1: Change only the public detail fixture, never canonical payload**

Replace the four existing `details.source/precision` objects in `supabase/seed.sql` with strict player-safe objects. Use deliberately different detail for the shared village:

```sql
-- Player A village
'{"category":"Vila","summary":"Ponto de chegada e mercado conhecido pelo personagem."}'::jsonb

-- Player A ghost
'{}'::jsonb

-- Player B village
'{"category":"Assentamento","summary":"Vila registrada em um mapa compartilhado confiável."}'::jsonb

-- Player B investigated secret
'{"category":"Ruína investigada","summary":"Um mosteiro oculto que o personagem já investigou pessoalmente."}'::jsonb
```

Leave `world_private.locations.payload` and `secret_payload` unchanged to prove no automatic copy occurs.

- [ ] **Step 2: Add RLS assertions for player-specific detail and immutable client surface**

Increase `select plan(22)` by the exact number of new assertions added.

Add a privilege assertion before switching roles:

```sql
select ok(
  not has_table_privilege('authenticated', 'player_api.map_nodes', 'UPDATE'),
  'authenticated cannot directly UPDATE node detail projection rows'
);
```

Under player A, assert its village `details` equals the A object. Under player B, assert its village `details` equals the B object. Do not add canonical IDs to public rows for test convenience.

- [ ] **Step 3: Run DB tests and confirm the updated fixture is coherent**

```bash
pnpm db:reset
pnpm db:test
```

Expected: all SQL suites PASS. If the count fails, fix `plan(N)` to the exact assertion count rather than weakening tests.

- [ ] **Step 4: Extend direct PostgREST smoke**

In `database-api-leakage-test.mjs`, add constants for the expected A/B village summaries. Find each player's village row by its projection-local ID and assert:

```js
assert(playerAVillage.details.category === 'Vila', 'player A village category mismatch');
assert(playerAVillage.details.summary === PLAYER_A_VILLAGE_SUMMARY, 'player A village summary mismatch');
assert(!playerAJson.includes(PLAYER_B_VILLAGE_SUMMARY), 'player A received player B detail');
```

Mirror for B. Also assert player A ghost has `details` exactly `{}` and neither player JSON contains canonical location payload strings such as `"social"`, `"market"`, `"entrance"`, or `"occupants"` as a consequence of automatic detail copying.

- [ ] **Step 5: Extend real Auth A/B smoke**

Add the same player-specific detail assertions after real password authentication. Keep diagnostics body-free; never print access tokens, service keys or response bodies on failure.

- [ ] **Step 6: Run both smokes**

```bash
node scripts/database-api-leakage-test.mjs
node scripts/player-auth-projection-test.mjs
```

Expected: PASS with existing route topology/exact-geometry assertions unchanged.

- [ ] **Step 7: Commit**

```bash
git add supabase/seed.sql supabase/tests/database/rls.test.sql scripts/database-api-leakage-test.mjs scripts/player-auth-projection-test.mjs
git commit -m "test: prove player-specific sanitized node details"
```

---

### Task 4: Make SVG nodes accessible interaction targets without making the renderer client-side

**Files:**
- Modify: `apps/player/app/player-map-svg.tsx`
- Modify: `apps/player/app/player-map-svg.test.tsx`

**Interfaces:**
- Produces server-rendered node groups with `data-player-node="true"`, projection-local `data-node-id`, `role="button"`, `tabIndex={0}`, `aria-pressed="false"`, `aria-controls="player-node-detail-panel"`, generic safe accessible names, visible marker metadata and separate non-scaling hit targets.
- Consumed by: `PlayerMapExplorer` event delegation in Task 6.

- [ ] **Step 1: Add failing static-markup tests**

Update the test projection to include one labeled known node and one unlabeled ghost. Assert the markup contains:

```ts
expect(html).toContain('role="group"');
expect(html).toContain('data-player-node="true"');
expect(html).toContain('data-node-id="node:known"');
expect(html).toContain('role="button"');
expect(html).toContain('tabindex="0"');
expect(html).toContain('aria-pressed="false"');
expect(html).toContain('aria-controls="player-node-detail-panel"');
expect(html).toContain('data-node-hit-target="true"');
expect(html).toContain('aria-label="Local não identificado, localização aproximada"');
expect(html).not.toContain('aria-label="node:ghost"');
```

Keep the exact route path assertion from 8D.

- [ ] **Step 2: Run renderer test and confirm RED**

```bash
pnpm vitest run apps/player/app/player-map-svg.test.tsx
```

Expected: FAIL because nodes are not interactive yet and SVG root is still `role="img"`.

- [ ] **Step 3: Implement minimal server markup**

Keep `PlayerMapSvg` without `'use client'`, hooks, Supabase or fetch.

Change root SVG to a named interactive group:

```tsx
<svg aria-label={accessibleName} className="player-map-svg" preserveAspectRatio="xMidYMid meet" role="group" viewBox={viewport.viewBox}>
```

For each node, render one focusable `<g>` at the authorized position:

```tsx
<g
  aria-controls="player-node-detail-panel"
  aria-label={accessibleNodeName}
  aria-pressed="false"
  data-node-id={node.id}
  data-node-role={node.role}
  data-node-selected="false"
  data-player-node="true"
  key={node.id}
  role="button"
  tabIndex={0}
>
```

Mark the existing visible circle with `data-node-marker="true"`.

Add a second interaction-only circle at the same authorized position:

```tsx
<circle
  aria-hidden="true"
  className="player-node-hit-target"
  cx={position.x}
  cy={position.y}
  data-node-hit-target="true"
  r={NODE_RADIUS}
  vectorEffect="non-scaling-stroke"
/>
```

Accessible name rules:

```ts
const base = node.label ?? 'Local não identificado';
const accessibleNodeName = node.role === 'ghost' ? `${base}, localização aproximada` : base;
```

Never use `node.id`, `symbolKey`, hidden kind or coordinates as fallback copy.

- [ ] **Step 4: Run renderer tests and confirm GREEN**

```bash
pnpm vitest run apps/player/app/player-map-svg.test.tsx
```

Expected: PASS, including exact route rendering and empty state.

- [ ] **Step 5: Commit**

```bash
git add apps/player/app/player-map-svg.tsx apps/player/app/player-map-svg.test.tsx
git commit -m "feat: expose accessible player node interaction targets"
```

---

### Task 5: Derive a geometry-free client node view model

**Files:**
- Create: `apps/player/lib/map/player-node-detail-model.ts`
- Create: `apps/player/lib/map/player-node-detail-model.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PlayerNodeDetailView {
  id: string;
  label?: string;
  role: 'known' | 'ghost';
  knowledgeState?: ProjectionNode['knowledgeState'];
  detail?: ProjectionNodeDetail;
}

export function buildPlayerNodeDetailViews(projection: MapProjection): PlayerNodeDetailView[];
export function getPlayerNodeDisplayName(node: Pick<PlayerNodeDetailView, 'label'>): string;
export function getPlayerNodeAccessibleName(node: Pick<PlayerNodeDetailView, 'label' | 'role'>): string;
export function formatPlayerKnowledgeState(state: NonNullable<ProjectionNode['knowledgeState']>): string;
```

- Explicitly does not produce position, approximateLocation, confidence, symbolKey, metadata, route data or canonical IDs.

- [ ] **Step 1: Write failing minimization tests**

Use a projection node containing geometry, confidence, metadata and detail. Assert exact equality:

```ts
expect(buildPlayerNodeDetailViews(projection)).toEqual([
  {
    id: 'node:known',
    label: 'Vila Qinghe',
    role: 'known',
    knowledgeState: 'confirmed',
    detail: { category: 'Vila', summary: 'Ponto conhecido.' },
  },
]);
```

Also assert JSON output does not contain `position`, `approximateLocation`, `confidence`, `symbolKey`, `metadata`, or any route ID.

Test copy helpers:

```ts
expect(getPlayerNodeDisplayName({})).toBe('Local não identificado');
expect(getPlayerNodeAccessibleName({ role: 'ghost' })).toBe(
  'Local não identificado, localização aproximada',
);
expect(formatPlayerKnowledgeState('indication')).toBe('Indício');
```

Map all six states: Rumor, Indício, Localizado, Confirmado, Investigado, Compreendido.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm vitest run apps/player/lib/map/player-node-detail-model.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure view-model module**

Filter `projection.items` to `kind === 'node'` and explicitly construct only the interface fields above. Do not spread the projection node.

Use a total `switch` for the six knowledge-state labels; no fallback string based on raw identifiers.

- [ ] **Step 4: Run and confirm GREEN**

```bash
pnpm vitest run apps/player/lib/map/player-node-detail-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/player/lib/map/player-node-detail-model.ts apps/player/lib/map/player-node-detail-model.test.ts
git commit -m "feat: derive minimal player node detail view models"
```

---

### Task 6: Add the minimal client explorer and interaction tests

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/player/app/player-map-explorer.tsx`
- Create: `apps/player/app/player-map-explorer.test.tsx`

**Interfaces:**
- Consumes: `readonly PlayerNodeDetailView[]` and server-rendered `children: ReactNode`.
- Produces: ephemeral `selectedNodeId`, delegated node activation, synchronized DOM selection attributes, a non-modal panel with id `player-node-detail-panel`, explicit close and focus restoration.

- [ ] **Step 1: Add the single DOM test dependency**

Run:

```bash
pnpm add -Dw jsdom@30.0.1
```

Do not add Testing Library, global-jsdom, Cypress or Playwright in 8E.

- [ ] **Step 2: Write the jsdom test harness before the component**

Create `player-map-explorer.test.tsx` beginning with:

```ts
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
```

Render the real `PlayerMapSvg` as the explorer child so event delegation is tested against the actual server markup shape.

Use `act` around renders/events and unmount in `afterEach`.

- [ ] **Step 3: Add failing click/keyboard/panel tests**

Cover all of these independently:

1. click known node -> panel shows label/category/summary/state;
2. focus + Enter -> selects;
3. focus + Space -> `preventDefault` and selects;
4. select a second node -> same panel updates;
5. activate selected node again -> remains open;
6. `Fechar` -> hides panel and restores focus to selected node;
7. Escape from node -> closes and focus remains usable;
8. Escape from close button -> closes and restores selected-node focus;
9. node with no detail -> panel still renders display name/state;
10. unlabeled ghost -> only generic `Local não identificado` + `Localização aproximada` copy;
11. injected DOM node with unknown `data-node-id` -> selection unchanged;
12. stub `globalThis.fetch = vi.fn()` -> zero calls after every selection path;
13. selected SVG group becomes `aria-pressed="true"` and `data-node-selected="true"`, previously selected node returns to false.

- [ ] **Step 4: Run and confirm RED**

```bash
pnpm vitest run apps/player/app/player-map-explorer.test.tsx
```

Expected: FAIL because `PlayerMapExplorer` does not exist.

- [ ] **Step 5: Implement the Client Component with delegated events**

Start file with `'use client';`.

Build a stable authorized lookup:

```ts
const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
```

Resolve an activated SVG group from the event target:

```ts
function findPlayerNodeElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('[data-player-node="true"]') : null;
}
```

On click, read `data-node-id`; select only when `nodesById.has(id)`.

On keydown:

```ts
if (event.key === 'Escape') closeSelection(true);
if (event.key === 'Enter' || event.key === ' ') {
  const nodeElement = findPlayerNodeElement(event.target);
  if (!nodeElement) return;
  if (event.key === ' ') event.preventDefault();
  activateNodeElement(nodeElement);
}
```

No handler calls fetch/router/server actions.

- [ ] **Step 6: Synchronize server-rendered node state without converting SVG to client rendering**

Use a wrapper `ref` and an effect over `[selectedNodeId]`:

```ts
for (const element of root.querySelectorAll<HTMLElement>('[data-player-node="true"]')) {
  const selected = element.dataset.nodeId === selectedNodeId;
  element.setAttribute('aria-pressed', selected ? 'true' : 'false');
  element.dataset.nodeSelected = selected ? 'true' : 'false';
}
```

Do not rewrite geometry, labels, role or IDs.

Focus restoration must iterate authorized node elements and compare `dataset.nodeId`; do not build a CSS selector from untrusted IDs.

- [ ] **Step 7: Render a non-modal panel from only the selected view model**

Render an `<aside id="player-node-detail-panel">` that remains in the DOM but uses `hidden={selectedNode === null}`. When selected, display only:

```tsx
<h2>{getPlayerNodeDisplayName(selectedNode)}</h2>
{selectedNode.detail?.category ? <p>{selectedNode.detail.category}</p> : null}
{selectedNode.knowledgeState ? <p>{formatPlayerKnowledgeState(selectedNode.knowledgeState)}</p> : null}
{selectedNode.role === 'ghost' ? <p>Localização aproximada</p> : null}
{selectedNode.detail?.summary ? <p>{selectedNode.detail.summary}</p> : null}
<button type="button" onClick={() => closeSelection(true)}>Fechar</button>
```

React text escaping is the only rendering mode; do not use `dangerouslySetInnerHTML` or a Markdown renderer.

- [ ] **Step 8: Run the client test and confirm GREEN**

```bash
pnpm vitest run apps/player/app/player-map-explorer.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Run the affected player suites together**

```bash
pnpm vitest run apps/player/app/player-map-svg.test.tsx apps/player/app/player-map-explorer.test.tsx apps/player/lib/map/player-node-detail-model.test.ts apps/player/lib/map/player-projection-source.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml apps/player/app/player-map-explorer.tsx apps/player/app/player-map-explorer.test.tsx
git commit -m "feat: add compact player node detail explorer"
```

---

### Task 7: Compose the explorer on the authenticated home and add responsive presentation

**Files:**
- Modify: `apps/player/app/page.tsx`
- Modify: `apps/player/app/globals.css`
- Modify: `apps/player/app/player-map-explorer.test.tsx`

**Interfaces:**
- Consumes: safe `MapProjection`, `buildPlayerNodeDetailViews`, `PlayerMapExplorer`, existing `PlayerMapSvg`.
- Produces: authenticated server page that sends the client island only minimized authorized node data.

- [ ] **Step 1: Add a failing composition-oriented test assertion**

In the explorer DOM test, assert the client-visible serialized/view-model fixture contains no geometry/confidence/metadata and that the panel behavior works without those fields. This complements the pure minimization test and prevents accidental client API expansion.

- [ ] **Step 2: Update `page.tsx` without changing auth/projection loading**

Keep all current session resolution and `loadPlayerHomeMap` logic unchanged.

For non-unavailable states:

```tsx
const nodeDetails = buildPlayerNodeDetailViews(mapState.projection);

<PlayerMapExplorer nodes={nodeDetails}>
  <PlayerMapSvg projection={mapState.projection} />
</PlayerMapExplorer>
```

Do not pass `session`, Supabase client, `playerId`, route rows or database response objects into `PlayerMapExplorer`.

- [ ] **Step 3: Add hit-target and interaction-state CSS**

Use presentation-only rules equivalent to:

```css
.player-node-hit-target {
  fill: none;
  stroke: transparent;
  stroke-width: 44px;
  pointer-events: stroke;
  vector-effect: non-scaling-stroke;
}

.player-map-svg [data-player-node='true'] {
  cursor: pointer;
  outline: none;
}

.player-map-svg [data-player-node='true']:focus-visible [data-node-marker='true'],
.player-map-svg [data-player-node='true'][data-node-selected='true'] [data-node-marker='true'] {
  stroke: currentColor;
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}
```

Do not alter known/ghost position, uncertainty radius, route path, or viewport calculations.

- [ ] **Step 4: Add compact panel layout CSS**

Use the existing Foundation card rather than an overlay. Desktop may use an adjacent/lower grid area; under the existing `40rem` media query, stack panel below the map. Keep a minimum 44px close-button height and clear focus-visible outline.

The panel must not use fixed positioning, modal backdrop or cover the SVG.

- [ ] **Step 5: Run format/type/unit/build for the affected app**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/player/app/page.tsx apps/player/app/globals.css apps/player/app/player-map-explorer.test.tsx
git commit -m "feat: integrate touch-friendly node details into player map"
```

---

### Task 8: Full security verification, closure docs and draft PR

**Files:**
- Create: `docs/PLAYER_NODE_DETAILS_V0_STATUS.md`
- Modify: `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md`

**Interfaces:**
- Produces: auditable 8E closure evidence; no merge/deploy.

- [ ] **Step 1: Run the complete quality gate from a clean dependency state**

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS. Record exact test file/test counts from this run or CI; do not pre-write guessed counts.

- [ ] **Step 2: Run the complete database/security gate**

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

Expected:
- all DB/RLS tests PASS;
- PostgREST A/B detail + route leakage smoke PASS;
- real Auth A/B detail + route isolation smoke PASS;
- type diff is empty because 8E has no DB schema migration.

- [ ] **Step 3: Audit the branch against the exact 8D base**

```bash
git diff --check 65a2ecd6961624210a6a85086eee68c139440a85...HEAD
git diff --name-status 65a2ecd6961624210a6a85086eee68c139440a85...HEAD
git status --short
```

Expected: no whitespace errors, no accidental files, no edits to `main`, no secrets, no generated temp DB types file.

- [ ] **Step 4: Push functional head and require CI green before writing closure claims**

Require the permanent CI workflow to show both `quality: SUCCESS` and `database: SUCCESS` on the functional implementation head. If either job fails, diagnose and fix before proceeding.

- [ ] **Step 5: Write the 8E status checkpoint with observed evidence only**

Create `docs/PLAYER_NODE_DETAILS_V0_STATUS.md` containing:

- branch and exact functional head;
- exact CI run number/id;
- quality/database conclusions;
- observed unit and DB test counts;
- PostgREST/Auth smoke result messages;
- contract: strict category/summary only;
- confirmation that `{}` produces no detail;
- confirmation that client receives geometry-free node view models;
- confirmation that no node-selection fetch/Supabase/world_private path exists;
- mouse/touch/Enter/Space/Escape/close behavior;
- no merge/deploy;
- Gate 8 remains open;
- next cut: confidence/origin/freshness/privacy presentation.

Do not claim Playwright/mobile-device validation in 8E.

- [ ] **Step 6: Update progress document**

Append an 8E section to `docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md` using the same observed evidence and mark compact/touch node details technically closed. Leave later Gate 8 work open.

- [ ] **Step 7: Commit docs and require CI green again on the documentation head**

```bash
git add docs/PLAYER_NODE_DETAILS_V0_STATUS.md docs/PLAYER_KNOWLEDGE_V0_PROGRESS.md
git commit -m "docs: close player node details 8E"
```

Push and require both permanent CI jobs green on this new head before calling it the final 8E head.

- [ ] **Step 8: Create the draft PR without merge/deploy**

Create a draft PR:

- title: `Foundation V0 — Player Node Details 8E`
- base: `foundation/player-route-knowledge-v0`
- head: `foundation/player-node-details-v0`
- state: OPEN/DRAFT/UNMERGED

PR body must summarize the anti-leak boundary, strict detail contract, no-network selection, accessibility/touch behavior, final CI evidence and that Gate 8 remains open.

- [ ] **Step 9: Update Drive only after the final documentation head is green**

Update the canonical Drive Master, Bootstrap Checklist and Architecture Decisions with:

- 8E final head and CI evidence;
- `CORTES 8A/8B/8C/8D/8E VERDES`;
- compact/touch node details marked complete;
- permanent rule that interactive detail never fetches additional world truth from a selected projection-local ID;
- next action: confidence/origin/freshness/privacy presentation;
- Gate 8 remains open.

Do not record 8E as green before the final documentation-head CI succeeds.

---

## Final Security Invariants to Re-check During Execution

Before completion, explicitly verify all of these from code/diff/tests:

1. `PlayerMapExplorer` contains no `fetch`, Supabase import, server action or router lookup for node truth.
2. Client props contain only `id`, `label?`, `role`, `knowledgeState?`, `detail?`; no position, geometry, radius, confidence, metadata, owner/player IDs or route data.
3. SVG node IDs are projection-local IDs already present in `MapProjection`.
4. Unknown DOM IDs cannot change selection to an unauthorized object and cannot cause a request.
5. `player_api.map_nodes.details` parser rejects extra keys and invalid shapes rather than filtering them silently.
6. Public detail fixtures do not copy canonical `payload` or `secret_payload`.
7. React renders detail as escaped text only.
8. `PlayerMapSvg` remains server-rendered and geometry-exact to the supplied projection.
9. Hit-target markup does not participate in `calculatePlayerSvgViewport` and uses only authorized node centers.
10. Route knowledge behavior from 8D remains unchanged.
11. Existing Auth identity ownership and A/B RLS isolation remain green.
12. No migration/schema drift is introduced by 8E.
