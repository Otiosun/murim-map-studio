begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select has_column(
  'world_private',
  'worlds',
  'current_world_minute',
  'world has narrative minute'
);
select has_column(
  'world_private',
  'player_location_knowledge',
  'refreshed_world_minute',
  'location knowledge has narrative refresh minute'
);
select has_column(
  'world_private',
  'player_route_knowledge',
  'refreshed_world_minute',
  'route knowledge has narrative refresh minute'
);
select has_column(
  'world_private',
  'player_location_knowledge',
  'freshness_window_minutes',
  'location knowledge can opt into staleness'
);
select has_column(
  'world_private',
  'player_route_knowledge',
  'privacy',
  'route knowledge has privacy metadata'
);

select is(
  server_api.player_confidence_band_v1(0.0000),
  'low'::text,
  '0 is low'
);
select is(
  server_api.player_confidence_band_v1(0.3999),
  'low'::text,
  '0.3999 is low'
);
select is(
  server_api.player_confidence_band_v1(0.4000),
  'moderate'::text,
  '0.4 is moderate'
);
select is(
  server_api.player_confidence_band_v1(0.6999),
  'moderate'::text,
  '0.6999 is moderate'
);
select is(
  server_api.player_confidence_band_v1(0.7000),
  'high'::text,
  '0.7 is high'
);
select is(
  server_api.player_confidence_band_v1(0.8999),
  'high'::text,
  '0.8999 is high'
);
select is(
  server_api.player_confidence_band_v1(0.9000),
  'very-high'::text,
  '0.9 is very high'
);
select is(
  server_api.player_confidence_band_v1(1.0000),
  'very-high'::text,
  '1 is very high'
);

select is(
  server_api.player_freshness_v1(100, 100, 60),
  'just-updated'::text,
  'age zero is just updated'
);
select is(
  server_api.player_freshness_v1(129, 100, 60),
  'recent'::text,
  'first half is recent'
);
select is(
  server_api.player_freshness_v1(130, 100, 60),
  'aging'::text,
  'half window is aging'
);
select is(
  server_api.player_freshness_v1(159, 100, 60),
  'aging'::text,
  'last minute before window is aging'
);
select is(
  server_api.player_freshness_v1(160, 100, 60),
  'stale'::text,
  'full window is stale'
);
select is(
  server_api.player_freshness_v1(500, 100, null),
  'not-applicable'::text,
  'no window means not applicable'
);

select throws_ok(
  $$select server_api.player_freshness_v1(100, 101, 60)$$,
  '22023',
  'future_knowledge_world_minute',
  'future knowledge minute fails closed'
);
select throws_ok(
  $$select server_api.player_freshness_v1(-1, 0, 60)$$,
  '22023',
  'invalid_world_minute',
  'negative world minute fails closed'
);
select throws_ok(
  $$select server_api.player_freshness_v1(100, 100, 0)$$,
  '22023',
  'invalid_freshness_window',
  'non-positive freshness window fails closed'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'server_api.player_confidence_band_v1(numeric)',
    'EXECUTE'
  ),
  'authenticated cannot invoke confidence helper'
);
select ok(
  has_function_privilege(
    'service_role',
    'server_api.player_confidence_band_v1(numeric)',
    'EXECUTE'
  ),
  'service role can invoke confidence helper'
);

select * from finish();
rollback;
