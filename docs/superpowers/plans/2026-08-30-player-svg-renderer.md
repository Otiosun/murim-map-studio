# Player SVG Renderer V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the authenticated player's authorized `MapProjection` as a lightweight, accessible server-rendered SVG map while preserving every Gate 8B authorization and anti-leak invariant.

**Architecture:** Keep all geometry/bounds derivation pure and framework-independent inside `@murim/map-renderer`. Keep React/SVG markup in `apps/player`, and compose the existing server-side session resolver plus `createSupabasePlayerProjectionSource` directly from the protected player page; do not call the app's own HTTP endpoint and do not add a browser Supabase client.

**Tech Stack:** TypeScript 6.0.2, React 19.2.7, React DOM 19.2.7, Next.js 16.3.3, Vitest 4.1.11, pnpm 11.21.0, existing Supabase SSR/client dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-player-svg-renderer-design.md`

## Global Constraints

- `MapProjection` is the only renderer input.
- Renderer code must never query Supabase, receive `world_private`, use service credentials, or decide authorization.
- The player page resolves identity from the existing authenticated server session only; request/client input cannot choose `playerId`.
- Reuse `createSupabasePlayerProjectionSource` directly on the server; do not make a server-to-server call to `/api/map-projection`.
- Preserve world-unit coordinates. Do not persist or introduce pixel-space domain coordinates.
- No React dependency is added to `packages/map-renderer`.
- Do not implement pan/zoom/pinch, node detail UI, notes, sharing, new route-knowledge semantics, animation, PixiJS/WebGPU, realtime, or map editing in Gate 8C.
- Existing Gate 8B security tests, DB/RLS tests, PostgREST leakage smoke, Auth A/B smoke, and generated DB type-drift check remain mandatory.

---

## File Structure

### New files

- `packages/map-renderer/src/player-viewport.ts` — pure geometry collection and deterministic SVG viewport calculation from authorized projection items only.
- `packages/map-renderer/src/player-viewport.test.ts` — unit tests for world-unit bounds, ghost uncertainty, degenerate geometry, fallback, and non-mutation.
- `apps/player/app/player-map-svg.tsx` — pure server-compatible React component that renders nodes/routes/labels from a `MapProjection`.
- `apps/player/app/player-map-svg.test.tsx` — static-markup tests for semantic SVG output and empty state.
- `apps/player/lib/map/player-home-model.ts` — server-side composition helper that turns a resolved player ID plus projection source into `ready | empty | unavailable`, sanitizing failures.
- `apps/player/lib/map/player-home-model.test.ts` — tests that prove the resolved ID is forwarded exactly, projection reaches presentation, empty is distinct, and source failures are sanitized.

### Modified files

- `packages/map-renderer/src/index.ts` — export viewport helper/types.
- `apps/player/app/page.tsx` — replace auth placeholder with authenticated projection loading and SVG/empty/unavailable composition while retaining sign-out.
- `apps/player/app/globals.css` — minimal responsive map-shell/SVG presentation; no final visual-polish scope creep.

---

### Task 1: Deterministic world-unit viewport

**Files:**
- Create: `packages/map-renderer/src/player-viewport.ts`
- Create: `packages/map-renderer/src/player-viewport.test.ts`
- Modify: `packages/map-renderer/src/index.ts`

**Interfaces:**
- Consumes: `MapProjection`, `ProjectionNode`, and `ProjectionRoute` from `./projection`.
- Produces:
  ```ts
  export interface PlayerSvgViewport {
    minX: number;
    minY: number;
    width: number;
    height: number;
    viewBox: string;
  }

  export function hasRenderablePlayerMapGeometry(projection: MapProjection): boolean;
  export function calculatePlayerSvgViewport(
    projection: MapProjection,
    padding?: number,
  ): PlayerSvgViewport;
  ```
- `padding` defaults to `24` world units.
- Only `node` and `route` items contribute to Gate 8C bounds.
- Ghost nodes expand bounds by `approximateLocation.radius` around `approximateLocation.center`; if an authorized ghost lacks `approximateLocation`, its projected `position` still contributes as a point.
- Fallback viewport is deterministic: `{ minX: -50, minY: -50, width: 100, height: 100, viewBox: '-50 -50 100 100' }` before optional padding is considered; implementation should return this exact fallback for no renderable geometry.
- Degenerate non-empty bounds must be expanded to at least `1` world unit on each axis before padding.

- [ ] **Step 1: Write failing viewport tests**

Create `packages/map-renderer/src/player-viewport.test.ts` with fixtures using only public `MapProjection` fields and assertions covering:

```ts
import { describe, expect, it } from 'vitest';
import type { MapProjection } from './projection';
import { calculatePlayerSvgViewport, hasRenderablePlayerMapGeometry } from './player-viewport';

const baseProjection = (items: MapProjection['items']): MapProjection => ({
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T00:00:00.000Z',
  items,
});

describe('calculatePlayerSvgViewport', () => {
  it('includes negative/fractional node coordinates and every route point', () => {
    const projection = baseProjection([
      {
        id: 'node:a', kind: 'node', metadata: {}, role: 'known', symbolKey: 'node:known',
        position: { x: -10.5, y: 4.25 },
      },
      {
        id: 'node:b', kind: 'node', metadata: {}, role: 'known', symbolKey: 'node:known',
        position: { x: 25.75, y: 40.5 },
      },
      {
        id: 'route:r', kind: 'route', metadata: {}, fromItemId: 'node:a', toItemId: 'node:b',
        styleKey: 'route:confirmed',
        path: { kind: 'polyline', points: [{ x: -30.25, y: 1.5 }, { x: 50.5, y: 60.75 }] },
      },
    ]);

    expect(calculatePlayerSvgViewport(projection, 0)).toEqual({
      minX: -30.25,
      minY: 1.5,
      width: 80.75,
      height: 59.25,
      viewBox: '-30.25 1.5 80.75 59.25',
    });
  });

  it('expands ghost bounds by authorized uncertainty radius', () => {
    const projection = baseProjection([{
      id: 'node:g', kind: 'node', metadata: {}, role: 'ghost', symbolKey: 'node:ghost',
      position: { x: 12, y: 20 },
      approximateLocation: { center: { x: 12, y: 20 }, radius: 5 },
    }]);

    expect(calculatePlayerSvgViewport(projection, 0)).toEqual({
      minX: 7, minY: 15, width: 10, height: 10, viewBox: '7 15 10 10',
    });
  });

  it('returns a finite deterministic fallback for no renderable geometry', () => {
    const projection = baseProjection([]);
    expect(hasRenderablePlayerMapGeometry(projection)).toBe(false);
    expect(calculatePlayerSvgViewport(projection)).toEqual({
      minX: -50, minY: -50, width: 100, height: 100, viewBox: '-50 -50 100 100',
    });
  });

  it('expands a single point to finite non-zero dimensions', () => {
    const projection = baseProjection([{
      id: 'node:a', kind: 'node', metadata: {}, role: 'known', symbolKey: 'node:known',
      position: { x: 2, y: 3 },
    }]);
    const viewport = calculatePlayerSvgViewport(projection, 0);
    expect(viewport.width).toBe(1);
    expect(viewport.height).toBe(1);
    expect(Number.isFinite(viewport.minX)).toBe(true);
    expect(Number.isFinite(viewport.minY)).toBe(true);
  });

  it('does not mutate the projection', () => {
    const projection = baseProjection([{
      id: 'node:a', kind: 'node', metadata: {}, role: 'known', symbolKey: 'node:known',
      position: { x: 2, y: 3 },
    }]);
    const before = structuredClone(projection);
    calculatePlayerSvgViewport(projection);
    expect(projection).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run packages/map-renderer/src/player-viewport.test.ts
```

Expected: FAIL because `./player-viewport` does not exist.

- [ ] **Step 3: Implement the minimal pure viewport helper**

Create `player-viewport.ts` so it:

```ts
import type { MapProjection } from './projection';

export interface PlayerSvgViewport {
  minX: number;
  minY: number;
  width: number;
  height: number;
  viewBox: string;
}

const FALLBACK: PlayerSvgViewport = {
  minX: -50,
  minY: -50,
  width: 100,
  height: 100,
  viewBox: '-50 -50 100 100',
};

export function hasRenderablePlayerMapGeometry(projection: MapProjection): boolean {
  return projection.items.some((item) => item.kind === 'node' || item.kind === 'route');
}
```

Then collect fresh `{x, y}` samples without mutating input. For ghost nodes with `approximateLocation`, sample center ± radius on both axes. For routes, sample every `path.points` entry. Compute min/max, expand zero-width/height axes symmetrically to `1`, then apply non-negative finite `padding` (use default `24`; reject invalid padding with `RangeError('Invalid viewport padding')`). Build `viewBox` from the final four numeric values.

- [ ] **Step 4: Export and verify GREEN**

Add to `packages/map-renderer/src/index.ts`:

```ts
export * from './player-viewport';
```

Run:

```bash
pnpm exec vitest run packages/map-renderer/src/player-viewport.test.ts
pnpm --filter @murim/map-renderer typecheck
```

Expected: focused tests PASS and renderer package typecheck PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/map-renderer/src/player-viewport.ts packages/map-renderer/src/player-viewport.test.ts packages/map-renderer/src/index.ts
git commit -m "feat: add player map viewport model"
```

---

### Task 2: Accessible server-rendered SVG component

**Files:**
- Create: `apps/player/app/player-map-svg.tsx`
- Create: `apps/player/app/player-map-svg.test.tsx`

**Interfaces:**
- Consumes: `MapProjection`, `calculatePlayerSvgViewport`, `hasRenderablePlayerMapGeometry` from `@murim/map-renderer`.
- Produces:
  ```ts
  export interface PlayerMapSvgProps {
    projection: MapProjection;
    accessibleName?: string;
  }

  export function PlayerMapSvg(props: PlayerMapSvgProps): React.JSX.Element;
  ```
- Default accessible name: `Mapa de conhecimento do jogador`.
- The component is server-compatible: no `'use client'`, hooks, browser APIs, fetches, or Supabase imports.
- Render routes first, ghost uncertainty second, node symbols/labels last so nodes remain visually legible.

- [ ] **Step 1: Write failing static-markup tests**

Use `renderToStaticMarkup` from `react-dom/server`, requiring no additional testing-library dependency.

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MapProjection } from '@murim/map-renderer';
import { PlayerMapSvg } from './player-map-svg';

const projection: MapProjection = {
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T00:00:00.000Z',
  items: [
    {
      id: 'node:known', kind: 'node', metadata: {}, role: 'known', symbolKey: 'node:known',
      label: 'Vila', position: { x: 10, y: 20 }, knowledgeState: 'confirmed',
    },
    {
      id: 'node:ghost', kind: 'node', metadata: {}, role: 'ghost', symbolKey: 'node:ghost',
      position: { x: 40, y: 50 }, approximateLocation: { center: { x: 40, y: 50 }, radius: 8 },
    },
    {
      id: 'route:r', kind: 'route', metadata: {}, fromItemId: 'node:known', toItemId: 'node:ghost',
      styleKey: 'route:rumor', path: { kind: 'polyline', points: [{ x: 10, y: 20 }, { x: 40, y: 50 }] },
    },
  ],
};

it('renders accessible SVG, authorized labels, route geometry and distinct known/ghost states', () => {
  const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);
  expect(html).toContain('<svg');
  expect(html).toContain('aria-label="Mapa de conhecimento do jogador"');
  expect(html).toContain('data-node-role="known"');
  expect(html).toContain('data-node-role="ghost"');
  expect(html).toContain('data-uncertainty="true"');
  expect(html).toContain('points="10,20 40,50"');
  expect(html).toContain('Vila');
});

it('does not invent a label for unlabeled projection items', () => {
  const html = renderToStaticMarkup(<PlayerMapSvg projection={projection} />);
  expect(html).not.toContain('node:ghost</text>');
});

it('renders a semantic empty state instead of an empty svg', () => {
  const empty: MapProjection = { ...projection, items: [] };
  const html = renderToStaticMarkup(<PlayerMapSvg projection={empty} />);
  expect(html).toContain('data-player-map-state="empty"');
  expect(html).not.toContain('<svg');
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
pnpm exec vitest run apps/player/app/player-map-svg.test.tsx
```

Expected: FAIL because `./player-map-svg` does not exist.

- [ ] **Step 3: Implement minimal SVG component**

Implement `PlayerMapSvg` with these exact rendering rules:

- If `hasRenderablePlayerMapGeometry(projection)` is false, return:
  ```tsx
  <div className="player-map-empty" data-player-map-state="empty" role="status">
    Nenhum conhecimento de mapa disponível ainda.
  </div>
  ```
- Otherwise render:
  ```tsx
  <svg
    className="player-map-svg"
    viewBox={viewport.viewBox}
    role="img"
    aria-label={accessibleName}
    preserveAspectRatio="xMidYMid meet"
  >
  ```
- Route items: `<polyline>` with `points` produced strictly from `item.path.points`, `fill="none"`, `vectorEffect="non-scaling-stroke"`, `aria-hidden="true"`, `data-route-style={item.styleKey}`.
- Ghost uncertainty: when `item.role === 'ghost' && item.approximateLocation`, render a decorative `<circle>` centered on the authorized approximate center with `r={radius}`, `data-uncertainty="true"`, and `aria-hidden="true"`.
- Node symbol: render a `<circle>` at `item.position` with `data-node-role={item.role}` and a small constant world-unit radius suitable only for Foundation V0.
- Labeled node: render `<text>` using exactly `item.label`; do not fall back to `id`, `symbolKey`, metadata, or knowledge-state names.
- Decorative route/uncertainty shapes stay hidden from accessibility; labeled node text remains readable.

- [ ] **Step 4: Verify GREEN without adding dependencies**

Run:

```bash
pnpm exec vitest run apps/player/app/player-map-svg.test.tsx
pnpm --filter @murim/player typecheck
```

Expected: PASS. `apps/player/package.json` remains unchanged.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/player/app/player-map-svg.tsx apps/player/app/player-map-svg.test.tsx
git commit -m "feat: render player projection as svg"
```

---

### Task 3: Authenticated player-page projection composition

**Files:**
- Create: `apps/player/lib/map/player-home-model.ts`
- Create: `apps/player/lib/map/player-home-model.test.ts`
- Modify: `apps/player/app/page.tsx`

**Interfaces:**
- Consumes existing:
  ```ts
  export interface PlayerProjectionSource {
    load(playerId: string): Promise<MapProjection>;
  }
  ```
- Produces:
  ```ts
  export type PlayerHomeMapState =
    | { status: 'ready'; projection: MapProjection }
    | { status: 'empty'; projection: MapProjection }
    | { status: 'unavailable' };

  export async function loadPlayerHomeMap(
    source: PlayerProjectionSource,
    playerId: string,
  ): Promise<PlayerHomeMapState>;
  ```
- A thrown source error is swallowed at this presentation boundary and becomes only `{ status: 'unavailable' }`; raw error messages never enter the returned object.

- [ ] **Step 1: Write failing composition-model tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { MapProjection } from '@murim/map-renderer';
import type { PlayerProjectionSource } from './player-projection-source';
import { loadPlayerHomeMap } from './player-home-model';

const projection = (items: MapProjection['items']): MapProjection => ({
  projectionVersion: 1,
  mapKey: 'player-map',
  generatedAt: '2026-08-30T00:00:00.000Z',
  items,
});

it('loads projection with exactly the resolved session player id', async () => {
  const value = projection([{
    id: 'node:a', kind: 'node', metadata: {}, role: 'known', symbolKey: 'node:known',
    position: { x: 1, y: 2 },
  }]);
  const load = vi.fn().mockResolvedValue(value);
  const source: PlayerProjectionSource = { load };
  await expect(loadPlayerHomeMap(source, 'player-session-id')).resolves.toEqual({ status: 'ready', projection: value });
  expect(load).toHaveBeenCalledWith('player-session-id');
  expect(load).toHaveBeenCalledTimes(1);
});

it('distinguishes a valid empty projection', async () => {
  const value = projection([]);
  const source: PlayerProjectionSource = { load: vi.fn().mockResolvedValue(value) };
  await expect(loadPlayerHomeMap(source, 'player-a')).resolves.toEqual({ status: 'empty', projection: value });
});

it('sanitizes projection source failures', async () => {
  const source: PlayerProjectionSource = {
    load: vi.fn().mockRejectedValue(new Error('database secret details')),
  };
  await expect(loadPlayerHomeMap(source, 'player-a')).resolves.toEqual({ status: 'unavailable' });
});
```

- [ ] **Step 2: Run focused model tests and verify RED**

```bash
pnpm exec vitest run apps/player/lib/map/player-home-model.test.ts
```

Expected: FAIL because `./player-home-model` does not exist.

- [ ] **Step 3: Implement minimal sanitized model**

```ts
import { hasRenderablePlayerMapGeometry, type MapProjection } from '@murim/map-renderer';
import type { PlayerProjectionSource } from './player-projection-source';

export type PlayerHomeMapState =
  | { status: 'ready'; projection: MapProjection }
  | { status: 'empty'; projection: MapProjection }
  | { status: 'unavailable' };

export async function loadPlayerHomeMap(
  source: PlayerProjectionSource,
  playerId: string,
): Promise<PlayerHomeMapState> {
  try {
    const projection = await source.load(playerId);
    return hasRenderablePlayerMapGeometry(projection)
      ? { status: 'ready', projection }
      : { status: 'empty', projection };
  } catch {
    return { status: 'unavailable' };
  }
}
```

- [ ] **Step 4: Compose the real protected page**

Modify `apps/player/app/page.tsx` so the existing sequence stays authoritative:

```ts
const supabase = await createPlayerSupabaseServerClient();
const session = await createSupabasePlayerSessionResolver(supabase).resolve();
if (!session) redirect('/login');
```

After that, create the source using the same already-created server client:

```ts
const mapState = await loadPlayerHomeMap(createSupabasePlayerProjectionSource(supabase), session.playerId);
```

Render within the existing authenticated shell:

- heading `Mapa do Jogador`;
- `PlayerMapSvg` for `ready`;
- the same empty state through `PlayerMapSvg` for `empty`;
- sanitized status for unavailable:
  ```tsx
  <div className="player-map-unavailable" data-player-map-state="unavailable" role="status">
    O mapa não está disponível no momento.
  </div>
  ```
- existing POST `/auth/signout` button stays present.

Do not import or call `/api/map-projection`; do not read URL/search params; do not introduce any player-id prop.

- [ ] **Step 5: Verify focused model + app typecheck**

```bash
pnpm exec vitest run apps/player/lib/map/player-home-model.test.ts apps/player/app/player-map-svg.test.tsx
pnpm --filter @murim/player typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/player/lib/map/player-home-model.ts apps/player/lib/map/player-home-model.test.ts apps/player/app/page.tsx
git commit -m "feat: load authorized map on player home"
```

---

### Task 4: Foundation presentation and Gate 8C verification

**Files:**
- Modify: `apps/player/app/globals.css`
- Modify only if evidence requires: implementation/tests from Tasks 1–3

**Interfaces:**
- No new domain interfaces.
- CSS consumes existing classes/data attributes only.

- [ ] **Step 1: Add minimal responsive Foundation V0 styling**

Extend `apps/player/app/globals.css` without changing login behavior:

```css
.player-map-card {
  width: min(100%, 52rem);
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid rgb(27 25 21 / 18%);
  background: rgb(255 255 255 / 35%);
}

.player-map-frame {
  width: 100%;
  min-height: 22rem;
  display: grid;
  place-items: stretch;
  overflow: hidden;
  border: 1px solid rgb(27 25 21 / 16%);
  background: #fffdf8;
}

.player-map-svg {
  display: block;
  width: 100%;
  height: min(70vh, 42rem);
}

.player-map-svg [data-route-style] {
  stroke: currentColor;
  stroke-width: 1.25;
  opacity: 0.55;
}

.player-map-svg [data-node-role='known'] {
  fill: currentColor;
}

.player-map-svg [data-node-role='ghost'] {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}

.player-map-svg [data-uncertainty='true'] {
  fill: currentColor;
  opacity: 0.08;
  stroke: currentColor;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.player-map-svg text {
  fill: currentColor;
  font-size: 4px;
}

.player-map-empty,
.player-map-unavailable {
  min-height: 22rem;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  text-align: center;
}
```

If actual SVG geometry makes a listed Foundation-only constant unreadable during build/static review, change only the presentation constant; do not change projection/domain data.

- [ ] **Step 2: Run the complete local quality suite available without Supabase**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS.

If format fails, run only:

```bash
pnpm format
```

then rerun the five checks. Any functional failure must be fixed with a regression test before implementation changes.

- [ ] **Step 3: Commit presentation/fixes**

```bash
git add apps/player/app/globals.css
# Include any evidence-driven test/fix files only if they were required by Step 2.
git commit -m "style: add player map foundation layout"
```

- [ ] **Step 4: Push/check permanent CI and require both jobs green**

Require the repository workflow on the Task 4 head to prove:

- `quality`: format, lint, typecheck, unit tests, build;
- `database`: Supabase reset/rebuild, 53+ DB/RLS tests, PostgREST leakage smoke, real Auth A/B projection smoke, generated DB types no drift.

Do not declare Gate 8C closed from local/unit evidence alone.

- [ ] **Step 5: Security regression review before closure**

Inspect the final diff and explicitly confirm all are still true:

```text
[ ] No service_role key or secret added to apps/player.
[ ] No browser Supabase client added.
[ ] No world_private import/query added.
[ ] No request/search-param/player-prop identity path added.
[ ] Renderer receives MapProjection only.
[ ] No canonical ID field added to projection contracts.
[ ] No hidden/ghost canonical location reconstruction.
[ ] User-facing projection failures contain no raw error text.
[ ] Existing 8B permanent security smokes are green in CI.
```

- [ ] **Step 6: Record Gate 8C checkpoint only after final CI**

After both permanent CI jobs are green, update the project checkpoint docs with the exact final head SHA and workflow run ID. Mark only **8C** closed; do not mark all of Gate 8 closed because route knowledge degrees, node detail, notes, sharing, and mobile interaction remain later work.
