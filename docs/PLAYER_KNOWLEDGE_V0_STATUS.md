# Player Knowledge V0 — Gate 8A

## Status

**Implementation evidence: PASS**

Branch: `foundation/player-knowledge-v0`  
PR: `#9` — draft, base `foundation/assets-v0`  
Implementation evidence head: `dd30ca428e8c2e257c59af3bdd058869490b3300`  
CI evidence run: `33294801271`

The implementation evidence run completed both permanent jobs successfully:

- `quality`: format, lint, typecheck, unit tests, build;
- `database`: pinned tooling, local Supabase startup, rebuild from Git, RLS/leakage tests, PostgREST leakage smoke, generated database type drift check, clean shutdown.

The branch documentation commit that contains this checkpoint must also receive a green permanent CI run before Gate 8A is considered closed.

## What 8A establishes

### One canonical knowledge grammar

Player knowledge uses exactly the domain vocabulary:

- `rumor`
- `indication`
- `localized`
- `confirmed`
- `investigated`
- `understood`

Legacy database vocabulary no longer defines a parallel semantic model.

### Server-safe spatial uncertainty

A ghost is already degraded before it reaches the browser.

The trusted side owns the approximate center and positive uncertainty radius. The player-facing projection does not receive the canonical position and then blur it locally.

The deterministic A/B proof uses the same canonical hidden location with different player knowledge:

- Player A receives a `ghost` at approximate `(820, 860)` with radius `180` and a safe rumor label;
- Player B receives a `known` investigated location at `(900, 900)` with the authorized location name.

### Projection-local identity

`player_api` and `MapProjection` use player/projection-local IDs. Canonical world IDs are not required by the renderer and are not exposed as player map identity.

### Pure player projection builder

`@murim/map-renderer` exports `buildPlayerMapProjection`.

The builder consumes only player-safe node/route DTOs. It does not consume canonical world entities.

V0 rules proven by tests:

- known nodes do not receive `approximateLocation`;
- ghost nodes require a finite positive uncertainty radius;
- ghost `approximateLocation` is built from the already-safe position/radius;
- `symbolKey` derives from player-safe `kind`;
- routes are emitted only when both projection-local endpoints exist;
- route style derives from player knowledge state;
- recursive leakage guards reject canonical/private field names from normalized output.

### Two perspectives of one world

The test suite and the real PostgREST smoke both prove divergent maps:

- Player A cannot see the canonical secret name, canonical IDs, Player B projection IDs, `source_location_id`, `secret_payload`, private schema, or trusted mutation API;
- Player B can receive the authorized investigated secret name;
- Player A and Player B do not receive identical map projections.

## Explicit non-goals of 8A

8A does **not** claim completion of:

- final authentication/session UX;
- final player map page;
- final Murim visual language;
- knowledge sharing/trading UI;
- realtime multiplayer editing;
- final exploration/case UX.

Those layers must consume this boundary rather than weaken it.

## Security invariant carried forward

> Canonical world truth is not a visual property to hide. It is data the player client must not receive unless that player's authorized knowledge projection contains it.

This invariant is architectural, not cosmetic.
