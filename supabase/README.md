# Supabase / database foundation

This directory is the reproducible database source of truth for Murim Map Studio.

## Pinned CLI

The repository pins `supabase@2.115.0` as a dev dependency. Do not use an implicit `latest` CLI in canonical workflows.

## Local rebuild

Docker (or a compatible container runtime) is required.

```bash
pnpm install
pnpm db:start
pnpm db:reset
pnpm db:test
```

Stop the local stack with:

```bash
pnpm db:stop
```

`supabase db reset --local` must be able to reconstruct schema + deterministic seed from Git alone.

## Security topology

- `world_private`: canonical world truth, exact geometry and secrets. Never exposed through Data API.
- `app_private`: authorization metadata such as narrator/admin roles. Never exposed through Data API.
- `player_api`: sanitized projection rows only. Exposed deliberately and protected by grants + RLS.
- `storage`: presentation assets have independent policies; assets are not world truth.
- `extensions`: extension-owned functions/types such as PostGIS.

Browser clients are ordinary `authenticated` users. Direct client access is read-only and restricted to the caller's projection by `auth.uid()`. Narrator/admin elevation is metadata for trusted server code; `service_role` is the system boundary and must never be sent to browsers.

## Spatial model

The fictional world is Cartesian and uses PostGIS `geometry` with SRID `0`:

- locations: `Point`
- routes: `LineString`
- regions/sectors: `MultiPolygon`
- rings: semantic center `Point` + inner/outer radii

No fictional coordinate is stored as latitude/longitude.
