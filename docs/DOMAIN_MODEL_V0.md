# Domain model V0

Foundation Phase 2 deliberately models world truth before any canvas implementation.

## Coordinate contract

Canonical coordinates are fictional planar **world units**, never screen pixels and never latitude/longitude. Renderers transform these coordinates into pixels. PostgreSQL/PostGIS can later adapt them to planar geometry with SRID 0.

## Identity contract

Every entity has a stable UUID-shaped ID at persistence/import boundaries. The domain package treats IDs as opaque strings; validation belongs at boundaries. This keeps the pure domain package independent of Node, databases and browsers.

V0 chooses UUID v4-compatible identifiers as the portability baseline. UUIDv7 remains a future optimization only if measured database/index behavior justifies it.

## Separation

- Semantics: `packages/domain`
- Boundary/import/export validation: `packages/world-schema`
- Renderer-neutral player/studio projection contract: `packages/map-renderer`
- Canvas/UI: intentionally absent from the domain

## World document

A document has one `rootWorldId` and a list of typed entities. Domain invariants reject duplicate IDs, missing/wrong references, foreign-world membership, invalid geometry, invalid rings and invalid knowledge confidence.

## World pack

`murim-world-pack` schema version 1 is an ADM/server-side interchange format. It is **not** a player API. A player must receive a separate `MapProjection` produced from authorized knowledge.

## Projection security boundary

`MapProjection` uses projection-local item IDs and contains only data authorized for rendering. Canonical source entity IDs are deliberately absent from the contract. Unknown/rumored places may be represented as ghost nodes with approximate geometry without revealing true canonical geometry.

## What is intentionally deferred

- Database tables and PostGIS migrations
- Rule AST/evaluator
- Case transition/effect semantics
- Command engine and undo/redo
- Konva
- persistence adapters
- player authentication/RLS
- autonomous AI
