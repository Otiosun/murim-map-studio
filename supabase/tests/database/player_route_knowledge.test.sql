begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

select has_table(
  'world_private',
  'player_route_knowledge',
  'private route knowledge exists'
);

select ok(
  not has_table_privilege('authenticated', 'world_private.player_route_knowledge', 'SELECT'),
  'authenticated cannot read private route knowledge'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'server_api.refresh_player_route_projection_v1(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute route materialization'
);

select ok(
  has_function_privilege(
    'service_role',
    'server_api.refresh_player_route_projection_v1(uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute route materialization'
);

select hasnt_column(
  'player_api',
  'map_routes',
  'source_route_id',
  'no canonical route id'
);

select hasnt_column(
  'player_api',
  'map_routes',
  'from_location_id',
  'no canonical from-location id'
);

select hasnt_column(
  'player_api',
  'map_routes',
  'to_location_id',
  'no canonical to-location id'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$select count(*)::bigint from player_api.map_routes$$,
  $$values (1::bigint)$$,
  'player A sees one route'
);

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('indication'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'indication uses authorized endpoint topology'
);

reset role;
update world_private.player_route_knowledge
set state = 'rumor', refreshed_at = '2026-08-31T06:01:00Z'
where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('rumor'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'rumor auto-syncs to safe topology'
);

reset role;
update world_private.player_route_knowledge
set state = 'localized', refreshed_at = '2026-08-31T06:02:00Z'
where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('localized'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'localized auto-syncs to safe topology'
);

select results_eq(
  $$
    select label, details
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values (null::text, '{}'::jsonb)$$,
  'route label/details contain no canonical-derived payload'
);

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_routes
    where extensions.st_dwithin(
      geom,
      extensions.st_setsrid(extensions.st_makepoint(1400,100),0),
      0.000001
    )
  $$,
  $$values (0::bigint)$$,
  'player A cannot recover canonical midpoint'
);

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_routes
    where projection_id = '94000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values (0::bigint)$$,
  'player A cannot see player B route id'
);

reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '94000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('investigated'::text, 'LINESTRING(100 120,1400 100,900 900)'::text)$$,
  'investigated route with exact endpoints may expose exact geometry'
);

reset role;
update player_api.map_nodes
set role = 'ghost',
    geom = extensions.st_setsrid(extensions.st_makepoint(860,850),0),
    approximate_radius = 120
where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
  and projection_id = '92000000-0000-4000-8000-000000000002'::uuid;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '94000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('investigated'::text, 'LINESTRING(100 120,860 850)'::text)$$,
  'endpoint downgrade immediately removes exact route geometry'
);

reset role;
update player_api.map_nodes
set role = 'known',
    geom = extensions.st_setsrid(extensions.st_makepoint(900,900),0),
    approximate_radius = null
where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
  and projection_id = '92000000-0000-4000-8000-000000000002'::uuid;

delete from world_private.player_route_knowledge
where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
  and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_routes
    where owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
  $$,
  $$values (0::bigint)$$,
  'deleting private route knowledge cleans public projection'
);

update world_private.player_route_knowledge
set state = 'confirmed', refreshed_at = '2026-08-31T06:03:00Z'
where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  and source_route_id = '30000000-0000-4000-8000-000000000001'::uuid;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;

select results_eq(
  $$
    select knowledge_state, extensions.st_astext(geom)
    from player_api.map_routes
    where projection_id = '93000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$values ('confirmed'::text, 'LINESTRING(100 120,820 860)'::text)$$,
  'confirmed route with ghost endpoint falls back safely'
);

reset role;
delete from player_api.map_nodes
where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  and projection_id = '91000000-0000-4000-8000-000000000002'::uuid;

select results_eq(
  $$
    select count(*)::bigint
    from player_api.map_routes
    where owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  $$,
  $$values (0::bigint)$$,
  'missing endpoint automatically suppresses route'
);

select ok(
  not has_schema_privilege('authenticated','world_private','USAGE'),
  'world_private remains private'
);

select ok(
  has_table_privilege('authenticated','player_api.map_routes','SELECT'),
  'authenticated can select safe routes'
);

select ok(
  not has_table_privilege('authenticated','player_api.map_routes','INSERT'),
  'authenticated cannot insert routes'
);

select * from finish();
rollback;
