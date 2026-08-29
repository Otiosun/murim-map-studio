begin;

select plan(15);

select ok(
  has_schema_privilege('service_role', 'server_api', 'USAGE'),
  'service_role can reach the trusted server API schema'
);
select ok(
  not has_schema_privilege('authenticated', 'server_api', 'USAGE'),
  'authenticated browser role cannot reach the server API schema'
);
select ok(
  has_function_privilege(
    'service_role',
    'server_api.commit_location_state_v1(text,uuid,uuid,text,bigint,text,text,text,text,text,timestamp with time zone,integer,jsonb,text,text,double precision,double precision,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'service_role can execute the location persistence adapter'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'server_api.commit_location_state_v1(text,uuid,uuid,text,bigint,text,text,text,text,text,timestamp with time zone,integer,jsonb,text,text,double precision,double precision,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'authenticated browser role cannot execute the persistence adapter'
);

select is(
  (
    select applied
    from server_api.commit_location_state_v1(
      p_event_id => 'test-create-location',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000099',
      p_action => 'create',
      p_expected_revision => null,
      p_event_kind => 'entity_created',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-create-location',
      p_occurred_at => '2026-08-29T23:20:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"CreateEntity"}'::jsonb,
      p_name => 'Posto de Teste',
      p_kind => 'outpost',
      p_x => 250,
      p_y => 275,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{"tags":["test"]}'::jsonb
    )
  ),
  true,
  'create commits validated location state'
);
select is(
  (select revision from world_private.locations where id = '20000000-0000-4000-8000-000000000099'),
  1::bigint,
  'new location starts at persistence revision 1'
);
select is(
  (select count(*) from world_private.world_event_ledger where event_id = 'test-create-location'),
  1::bigint,
  'the same transaction appends exactly one audit event'
);

select is(
  (
    select applied
    from server_api.commit_location_state_v1(
      p_event_id => 'test-create-location',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000099',
      p_action => 'create',
      p_expected_revision => null,
      p_event_kind => 'entity_created',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-create-location',
      p_occurred_at => '2026-08-29T23:20:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"CreateEntity"}'::jsonb,
      p_name => 'Posto de Teste',
      p_kind => 'outpost',
      p_x => 250,
      p_y => 275,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{"tags":["test"]}'::jsonb
    )
  ),
  false,
  'replaying the exact event is idempotent'
);
select is(
  (select revision from world_private.locations where id = '20000000-0000-4000-8000-000000000099'),
  1::bigint,
  'idempotent replay does not mutate state twice'
);

select is(
  (
    select committed_revision
    from server_api.commit_location_state_v1(
      p_event_id => 'test-move-village',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000001',
      p_action => 'update',
      p_expected_revision => 1,
      p_event_kind => 'entity_moved',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-move-village',
      p_occurred_at => '2026-08-29T23:21:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"MoveEntity","changedEntityIds":["20000000-0000-4000-8000-000000000001","30000000-0000-4000-8000-000000000001"]}'::jsonb,
      p_name => 'Vila Qinghe',
      p_kind => 'settlement',
      p_x => 180,
      p_y => 210,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{"tags":["social","market"]}'::jsonb
    )
  ),
  2::bigint,
  'update uses optimistic revision and commits revision 2'
);
select is(
  extensions.st_astext((select geom from world_private.locations where id = '20000000-0000-4000-8000-000000000001')),
  'POINT(180 210)',
  'location movement is persisted'
);
select is(
  extensions.st_astext((select geom from world_private.routes where id = '30000000-0000-4000-8000-000000000001')),
  'LINESTRING(180 210,420 460,900 900)',
  'connected route endpoint moves in the same transaction'
);
select is(
  (select revision from world_private.routes where id = '30000000-0000-4000-8000-000000000001'),
  2::bigint,
  'connected route revision advances with the atomic move'
);

select throws_ok(
  $$
    select * from server_api.commit_location_state_v1(
      p_event_id => 'test-stale-update',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000001',
      p_action => 'update',
      p_expected_revision => 1,
      p_event_kind => 'entity_updated',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-stale-update',
      p_occurred_at => '2026-08-29T23:22:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{}'::jsonb,
      p_name => 'Mudança Obsoleta',
      p_kind => 'settlement',
      p_x => 181,
      p_y => 211,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{}'::jsonb
    )
  $$,
  '40001',
  'revision_conflict: expected 1, found 2',
  'stale writes are rejected instead of silently overwriting newer state'
);

select throws_ok(
  $$
    select * from server_api.commit_location_state_v1(
      p_event_id => 'test-delete-referenced',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000001',
      p_action => 'delete',
      p_expected_revision => 2,
      p_event_kind => 'entity_deleted',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-delete-referenced',
      p_occurred_at => '2026-08-29T23:23:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{}'::jsonb
    )
  $$,
  '23503',
  'location_has_routes',
  'persistence preserves the domain rule against deleting referenced locations'
);

select throws_ok(
  $$update world_private.world_event_ledger set event_kind = 'tampered' where event_id = 'test-create-location'$$,
  '55000',
  'world_event_ledger is append-only',
  'ledger rows cannot be rewritten even by the migration owner'
);

select is(
  (select count(*) from world_private.world_event_ledger where correlation_id in ('corr-create-location', 'corr-move-village')),
  2::bigint,
  'successful canonical mutations leave an auditable correlation trail'
);

select * from finish();
rollback;
