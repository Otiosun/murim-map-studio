begin;

select plan(14);

select is(
  (
    select committed_revision
    from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-create',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'create',
      p_expected_revision => null,
      p_event_kind => 'entity_created',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:36:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"CreateEntity","historyOperation":"execute"}'::jsonb,
      p_name => 'Ermida Temporária',
      p_kind => 'shrine',
      p_x => 610,
      p_y => 640,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{"tags":["restore-test"]}'::jsonb
    )
  ),
  1::bigint,
  'initial create starts at revision 1'
);

select is(
  (
    select committed_revision
    from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-delete',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'delete',
      p_expected_revision => 1,
      p_event_kind => 'entity_deleted',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:37:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"DeleteEntity","historyOperation":"execute"}'::jsonb
    )
  ),
  2::bigint,
  'delete records a tombstone revision 2'
);
select is(
  (select count(*) from world_private.locations where id = '20000000-0000-4000-8000-000000000098'),
  0::bigint,
  'delete removes current state while history remains in the ledger'
);

select is(
  (
    select committed_revision
    from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-undo',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'restore',
      p_expected_revision => 2,
      p_event_kind => 'entity_restored',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:38:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"RestoreEntity","historyOperation":"undo"}'::jsonb,
      p_name => 'Ermida Temporária',
      p_kind => 'shrine',
      p_x => 610,
      p_y => 640,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{"tags":["restore-test"]}'::jsonb
    )
  ),
  3::bigint,
  'undo restore advances monotonically to revision 3'
);
select is(
  (select revision from world_private.locations where id = '20000000-0000-4000-8000-000000000098'),
  3::bigint,
  'restored current state retains the monotonic persistence revision'
);
select is(
  (select name from world_private.locations where id = '20000000-0000-4000-8000-000000000098'),
  'Ermida Temporária',
  'restore recreates the validated entity state'
);

select is(
  (
    select committed_revision
    from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-redo',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'delete',
      p_expected_revision => 3,
      p_event_kind => 'entity_deleted',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:39:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"DeleteEntity","historyOperation":"redo"}'::jsonb
    )
  ),
  4::bigint,
  'redo delete advances to revision 4 instead of resetting history'
);
select is(
  (select count(*) from world_private.locations where id = '20000000-0000-4000-8000-000000000098'),
  0::bigint,
  'redo leaves the current state deleted again'
);

select is(
  (
    select string_agg(entity_revision::text, ',' order by entity_revision)
    from world_private.world_event_ledger
    where world_id = '10000000-0000-4000-8000-000000000001'
      and entity_type = 'location'
      and entity_id = '20000000-0000-4000-8000-000000000098'
  ),
  '1,2,3,4',
  'ledger preserves one monotonic revision for every execute undo redo step'
);
select is(
  (
    select string_agg(payload ->> 'historyOperation', ',' order by entity_revision)
    from world_private.world_event_ledger
    where world_id = '10000000-0000-4000-8000-000000000001'
      and entity_type = 'location'
      and entity_id = '20000000-0000-4000-8000-000000000098'
  ),
  'execute,execute,undo,redo',
  'audit history explains which mutations were execute undo and redo'
);

select throws_ok(
  $$
    select * from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-illegal-recreate',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'create',
      p_expected_revision => null,
      p_event_kind => 'entity_created',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:40:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{}'::jsonb,
      p_name => 'ID Reutilizado',
      p_kind => 'shrine',
      p_x => 1,
      p_y => 1,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{}'::jsonb
    )
  $$,
  '23505',
  'entity_id_has_history',
  'create cannot reuse an ID whose canonical history already exists'
);

select throws_ok(
  $$
    select * from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-stale-undo',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'restore',
      p_expected_revision => 2,
      p_event_kind => 'entity_restored',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:41:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{}'::jsonb,
      p_name => 'Ermida Temporária',
      p_kind => 'shrine',
      p_x => 610,
      p_y => 640,
      p_area_id => '13000000-0000-4000-8000-000000000001',
      p_is_secret => false,
      p_payload => '{"tags":["restore-test"]}'::jsonb
    )
  $$,
  '40001',
  'revision_conflict: expected 2, found 4',
  'a stale undo cannot overwrite a later redo'
);

select is(
  (
    select applied
    from server_api.commit_location_state_v1(
      p_event_id => 'restore-cycle-redo',
      p_world_id => '10000000-0000-4000-8000-000000000001',
      p_location_id => '20000000-0000-4000-8000-000000000098',
      p_action => 'delete',
      p_expected_revision => 3,
      p_event_kind => 'entity_deleted',
      p_actor_kind => 'user',
      p_actor_ref => 'test-narrator',
      p_source => 'test',
      p_correlation_id => 'corr-restore-cycle',
      p_occurred_at => '2026-08-29T23:39:00Z',
      p_event_schema_version => 1,
      p_event_payload => '{"commandKind":"DeleteEntity","historyOperation":"redo"}'::jsonb
    )
  ),
  false,
  'exact redo replay is idempotent even after the row is absent'
);
select is(
  (
    select count(*)
    from world_private.world_event_ledger
    where world_id = '10000000-0000-4000-8000-000000000001'
      and entity_type = 'location'
      and entity_id = '20000000-0000-4000-8000-000000000098'
  ),
  4::bigint,
  'idempotent replay does not append a fifth ledger event'
);

select * from finish();
rollback;
