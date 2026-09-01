begin;

alter table world_private.worlds
  add column current_world_minute bigint not null default 0;

alter table world_private.worlds
  add constraint worlds_current_world_minute_nonnegative
  check (current_world_minute >= 0);

alter table world_private.player_location_knowledge
  add column learned_world_minute bigint not null default 0,
  add column refreshed_world_minute bigint not null default 0,
  add column freshness_window_minutes bigint,
  add column privacy text not null default 'private';

alter table world_private.player_location_knowledge
  add constraint player_location_knowledge_world_minutes_valid
    check (
      learned_world_minute >= 0
      and refreshed_world_minute >= learned_world_minute
    ),
  add constraint player_location_knowledge_freshness_window_positive
    check (freshness_window_minutes is null or freshness_window_minutes > 0),
  add constraint player_location_knowledge_privacy_allowed
    check (privacy in ('private', 'shared', 'public'));

alter table world_private.player_route_knowledge
  add column learned_world_minute bigint not null default 0,
  add column refreshed_world_minute bigint not null default 0,
  add column freshness_window_minutes bigint,
  add column privacy text not null default 'private';

alter table world_private.player_route_knowledge
  add constraint player_route_knowledge_world_minutes_valid
    check (
      learned_world_minute >= 0
      and refreshed_world_minute >= learned_world_minute
    ),
  add constraint player_route_knowledge_freshness_window_positive
    check (freshness_window_minutes is null or freshness_window_minutes > 0),
  add constraint player_route_knowledge_privacy_allowed
    check (privacy in ('private', 'shared', 'public'));

create function server_api.player_confidence_band_v1(p_confidence numeric)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception using errcode = '22023', message = 'invalid_player_confidence';
  end if;

  if p_confidence < 0.40 then
    return 'low';
  end if;

  if p_confidence < 0.70 then
    return 'moderate';
  end if;

  if p_confidence < 0.90 then
    return 'high';
  end if;

  return 'very-high';
end;
$$;

create function server_api.player_freshness_v1(
  p_current_world_minute bigint,
  p_refreshed_world_minute bigint,
  p_window_minutes bigint
)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  v_age bigint;
begin
  if p_current_world_minute is null
    or p_refreshed_world_minute is null
    or p_current_world_minute < 0
    or p_refreshed_world_minute < 0 then
    raise exception using errcode = '22023', message = 'invalid_world_minute';
  end if;

  if p_refreshed_world_minute > p_current_world_minute then
    raise exception using errcode = '22023', message = 'future_knowledge_world_minute';
  end if;

  if p_window_minutes is null then
    return 'not-applicable';
  end if;

  if p_window_minutes <= 0 then
    raise exception using errcode = '22023', message = 'invalid_freshness_window';
  end if;

  v_age := p_current_world_minute - p_refreshed_world_minute;

  if v_age = 0 then
    return 'just-updated';
  end if;

  if v_age * 2 < p_window_minutes then
    return 'recent';
  end if;

  if v_age < p_window_minutes then
    return 'aging';
  end if;

  return 'stale';
end;
$$;

revoke all on function server_api.player_confidence_band_v1(numeric)
  from public, anon, authenticated;
grant execute on function server_api.player_confidence_band_v1(numeric)
  to service_role;

revoke all on function server_api.player_freshness_v1(bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function server_api.player_freshness_v1(bigint, bigint, bigint)
  to service_role;

commit;
