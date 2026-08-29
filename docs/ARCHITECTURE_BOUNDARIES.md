# Architecture boundaries — Foundation V0

The project is intentionally split so the world model can outlive any renderer or UI framework.

- `apps/studio`: ADM/worldbuilding application.
- `apps/player`: player-facing shell and later authorized knowledge projection.
- `packages/domain`: pure domain model and invariants. No React, Konva or database client.
- `packages/world-schema`: versioned boundary/import/export schemas.
- `packages/rules`: safe rule AST/evaluator. No arbitrary JS evaluation.
- `packages/map-renderer`: renderer-neutral projection/adapters.
- `packages/ui`: shared presentation only; no canonical world rules.
- `supabase`: database config/migrations/seed beginning at Foundation Phase 3.

## Non-negotiable boundary

Canvas/render objects are never canonical world data. Secret world truth is never sent to the player client and hidden with CSS.
