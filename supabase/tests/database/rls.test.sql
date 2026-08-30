begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

select ok(
  not has_schema_privilege('authenticated', 'world_private', 'USAGE'),
  'authenticated has no USAGE on canonical world schema'
);

select ok(
  not has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  'authenticated has no USAGE on application-private schema'
);

select ok(
  not has_table_privilege('authenticated', 'world_private.locations', 'SELECT'),
  'authenticated cannot SELECT canonical locations'
);

select ok(
  has_schema_privilege('authenticated', 'player_api', 'USAGE'),
  'authenticated can reach the dedicated player API schema'
);

select ok(
  has_table_privilege('authenticated', 'player_api.map_nodes', 'SELECT'),
  'authenticated can SELECT sanitized map nodes'
);

select ok(
  not has_table_privilege('authenticated', 'player_api.map_nodes', 'INSERT'),
  'authenticated cannot directly INSERT projection rows'
);

select ok(
  not has_table_privilege('anon', 'player_api.map_nodes', 'SELECT'),
  'anonymous clients cannot SELECT player projections'
);

select hasnt_column(
  'player_api',
  'map_nodes',
  'source_location_id',
  'player projection exposes no canonical source location ID'
);

select hasnt_column(
  'player_api',
  'map_nodes',
  'canonical_id',
  'player projection exposes no canonical ID alias'
);

select hasnt_column(
  'player_api',
  'map_nodes',
  'secret_payload',
  'player projection exposes no secret payload column'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$select count(*)::bigint from player_api.map_nodes$$,
  $$values (2::bigint)$$,
  'player A sees only player A projection rows'
);

select results_eq(
  $$select count(*)::bigint from player_api.map_nodes where label = 'Mosteiro Sob as Raízes'$$,
  $$values (0::bigint)$$,
  'player A cannot obtain the canonical secret location name'
);

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_nodes
    where geom is not null
      and extensions.st_equals(
        geom,
        extensions.st_setsrid(extensions.st_makepoint(900, 900), 0)
      )
  $$,
  $$values (0::bigint)$$,
  'player A cannot obtain the true secret geometry'
);

select results_eq(
  $$select count(*)::bigint from player_api.map_nodes where projection_id = '92000000-0000-4000-8000-000000000002'::uuid$$,
  $$values (0::bigint)$$,
  'player A cannot read player B projection IDs'
);

reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;

select results_eq(
  $$select count(*)::bigint from player_api.map_nodes$$,
  $$values (2::bigint)$$,
  'player B sees only player B projection rows'
);

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_nodes
    where label = 'Mosteiro Sob as Raízes'
      and extensions.st_equals(
        geom,
        extensions.st_setsrid(extensions.st_makepoint(900, 900), 0)
      )
  $$,
  $$values (1::bigint)$$,
  'authorized player B receives the confirmed secret projection'
);

reset role;

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'map_assets_read_authenticated'
  ),
  'asset storage has a policy independent from world truth'
);

select results_eq(
  $$
    select id, name, public, file_size_limit, allowed_mime_types
    from storage.buckets
    where id = 'map-assets'
  $$,
  $$
    values (
      'map-assets'::text,
      'map-assets'::text,
      false,
      2097152::bigint,
      array['image/svg+xml', 'image/webp', 'image/png']::text[]
    )
  $$,
  'map asset bucket is private and constrained to the Studio import contract'
);

select results_eq(
  $$select role::text from app_private.user_roles order by role::text$$,
  $$values ('admin'::text), ('narrator'::text)$$,
  'narrator and admin application roles are represented explicitly'
);

select * from finish();
rollback;
