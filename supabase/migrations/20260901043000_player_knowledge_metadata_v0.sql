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

-- Normalize only legacy V0 source categories that existed before the source
-- vocabulary became strict. Unknown values still fail when the constraints are
-- installed so migration never silently invents a source category.
update world_private.player_location_knowledge
set origin_kind = case origin_kind
  when 'personal-exploration' then 'exploration'
  when 'npc-rumor' then 'npc'
  when 'shared-map' then 'player'
  else origin_kind
end
where origin_kind in ('personal-exploration', 'npc-rumor', 'shared-map');

update world_private.player_route_knowledge
set origin_kind = case origin_kind
  when 'personal-exploration' then 'exploration'
  when 'npc-rumor' then 'npc'
  when 'shared-map' then 'player'
  else origin_kind
end
where origin_kind in ('personal-exploration', 'npc-rumor', 'shared-map');

alter table world_private.player_location_knowledge
  add constraint player_location_knowledge_origin_kind_allowed
    check (origin_kind in ('system', 'exploration', 'npc', 'player', 'document', 'scene')),
  add constraint player_location_knowledge_origin_label_safe
    check (
      origin_label is null
      or (
        btrim(origin_label) <> ''
        and char_length(btrim(origin_label)) <= 120
        and btrim(origin_label) !~ '^[[:cntrl:][:space:]]*$'
      )
    );

alter table world_private.player_route_knowledge
  add constraint player_route_knowledge_origin_kind_allowed
    check (origin_kind in ('system', 'exploration', 'npc', 'player', 'document', 'scene')),
  add constraint player_route_knowledge_origin_label_safe
    check (
      origin_label is null
      or (
        btrim(origin_label) <> ''
        and char_length(btrim(origin_label)) <= 120
        and btrim(origin_label) !~ '^[[:cntrl:][:space:]]*$'
      )
    );

create function world_private.guard_world_minute_monotonic_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, world_private
as $$
begin
  if new.current_world_minute < old.current_world_minute then
    raise exception using errcode = '22023', message = 'world_minute_regression';
  end if;

  return new;
end;
$$;

revoke all on function world_private.guard_world_minute_monotonic_v1()
  from public, anon, authenticated;
grant execute on function world_private.guard_world_minute_monotonic_v1()
  to service_role;

create trigger world_minute_monotonic_guard
  before update of current_world_minute on world_private.worlds
  for each row execute function world_private.guard_world_minute_monotonic_v1();

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

-- Player-readable projection receives only constrained semantic metadata.
-- Columns are nullable during backfill, then tightened after every existing
-- projection row has been refreshed from its private knowledge record.
alter table player_api.map_nodes
  add column confidence_band text,
  add column source_kind text,
  add column source_label text,
  add column freshness text,
  add column privacy text;

alter table player_api.map_routes
  add column confidence_band text,
  add column source_kind text,
  add column source_label text,
  add column freshness text,
  add column privacy text;

create function server_api.refresh_player_node_knowledge_metadata_v1(
  p_owner_user_id uuid,
  p_source_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, server_api
as $$
declare
  v_knowledge world_private.player_location_knowledge%rowtype;
  v_current_world_minute bigint;
begin
  select *
    into v_knowledge
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id
     and source_location_id = p_source_location_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'location_knowledge_not_found';
  end if;

  select world.current_world_minute
    into v_current_world_minute
    from world_private.locations as location
    join world_private.worlds as world
      on world.id = location.world_id
   where location.id = p_source_location_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'world_not_found';
  end if;

  update player_api.map_nodes
     set confidence_band = server_api.player_confidence_band_v1(v_knowledge.confidence),
         source_kind = v_knowledge.origin_kind,
         source_label = case
           when v_knowledge.origin_label is null then null
           else btrim(v_knowledge.origin_label)
         end,
         freshness = server_api.player_freshness_v1(
           v_current_world_minute,
           v_knowledge.refreshed_world_minute,
           v_knowledge.freshness_window_minutes
         ),
         privacy = v_knowledge.privacy
   where owner_user_id = p_owner_user_id
     and projection_id = v_knowledge.projection_id;
end;
$$;

revoke all on function server_api.refresh_player_node_knowledge_metadata_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function server_api.refresh_player_node_knowledge_metadata_v1(uuid, uuid)
  to service_role;

create function world_private.sync_player_location_knowledge_metadata_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, world_private, server_api
as $$
begin
  perform server_api.refresh_player_node_knowledge_metadata_v1(
    new.owner_user_id,
    new.source_location_id
  );
  return new;
end;
$$;

revoke all on function world_private.sync_player_location_knowledge_metadata_v1()
  from public, anon, authenticated;

create trigger player_location_knowledge_metadata_sync
  after insert or update of confidence, origin_kind, origin_label,
    refreshed_world_minute, freshness_window_minutes, privacy
  on world_private.player_location_knowledge
  for each row execute function world_private.sync_player_location_knowledge_metadata_v1();

-- Replace the 8D route materializer without changing its geometry decision.
create or replace function server_api.refresh_player_route_projection_v1(
  p_owner_user_id uuid,
  p_source_route_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, extensions, server_api
as $$
declare
  v_knowledge world_private.player_route_knowledge%rowtype;
  v_route world_private.routes%rowtype;
  v_current_world_minute bigint;
  v_from_projection_id uuid;
  v_to_projection_id uuid;
  v_from_role text;
  v_to_role text;
  v_from_geom extensions.geometry;
  v_to_geom extensions.geometry;
  v_public_geom extensions.geometry;
begin
  select *
    into v_knowledge
    from world_private.player_route_knowledge
   where owner_user_id = p_owner_user_id
     and source_route_id = p_source_route_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'route_knowledge_not_found';
  end if;

  select *
    into v_route
    from world_private.routes
   where id = p_source_route_id;

  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select current_world_minute
    into v_current_world_minute
    from world_private.worlds
   where id = v_route.world_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'world_not_found';
  end if;

  select projection_id
    into v_from_projection_id
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id
     and source_location_id = v_route.from_location_id;

  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select projection_id
    into v_to_projection_id
    from world_private.player_location_knowledge
   where owner_user_id = p_owner_user_id
     and source_location_id = v_route.to_location_id;

  if not found then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select role, geom
    into v_from_role, v_from_geom
    from player_api.map_nodes
   where owner_user_id = p_owner_user_id
     and projection_id = v_from_projection_id;

  if not found or v_from_geom is null then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  select role, geom
    into v_to_role, v_to_geom
    from player_api.map_nodes
   where owner_user_id = p_owner_user_id
     and projection_id = v_to_projection_id;

  if not found or v_to_geom is null then
    delete from player_api.map_routes
     where owner_user_id = p_owner_user_id
       and projection_id = v_knowledge.projection_id;
    return;
  end if;

  v_public_geom := case
    when v_knowledge.state in ('confirmed', 'investigated', 'understood')
      and v_from_role = 'known'
      and v_to_role = 'known'
      then v_route.geom
    else extensions.st_makeline(v_from_geom, v_to_geom)
  end;

  insert into player_api.map_routes (
    owner_user_id,
    projection_id,
    from_projection_id,
    to_projection_id,
    label,
    knowledge_state,
    geom,
    details,
    confidence_band,
    source_kind,
    source_label,
    freshness,
    privacy,
    updated_at
  ) values (
    p_owner_user_id,
    v_knowledge.projection_id,
    v_from_projection_id,
    v_to_projection_id,
    null,
    v_knowledge.state::text,
    v_public_geom,
    '{}'::jsonb,
    server_api.player_confidence_band_v1(v_knowledge.confidence),
    v_knowledge.origin_kind,
    case
      when v_knowledge.origin_label is null then null
      else btrim(v_knowledge.origin_label)
    end,
    server_api.player_freshness_v1(
      v_current_world_minute,
      v_knowledge.refreshed_world_minute,
      v_knowledge.freshness_window_minutes
    ),
    v_knowledge.privacy,
    v_knowledge.refreshed_at
  )
  on conflict (owner_user_id, projection_id) do update
    set from_projection_id = excluded.from_projection_id,
        to_projection_id = excluded.to_projection_id,
        label = excluded.label,
        knowledge_state = excluded.knowledge_state,
        geom = excluded.geom,
        details = excluded.details,
        confidence_band = excluded.confidence_band,
        source_kind = excluded.source_kind,
        source_label = excluded.source_label,
        freshness = excluded.freshness,
        privacy = excluded.privacy,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function server_api.refresh_player_route_projection_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function server_api.refresh_player_route_projection_v1(uuid, uuid)
  to service_role;

-- Existing database rows are backfilled before the player projection contract
-- becomes NOT NULL and before raw confidence is removed.
do $$
declare
  v_location record;
  v_route record;
begin
  for v_location in
    select owner_user_id, source_location_id
      from world_private.player_location_knowledge
  loop
    perform server_api.refresh_player_node_knowledge_metadata_v1(
      v_location.owner_user_id,
      v_location.source_location_id
    );
  end loop;

  for v_route in
    select owner_user_id, source_route_id
      from world_private.player_route_knowledge
  loop
    perform server_api.refresh_player_route_projection_v1(
      v_route.owner_user_id,
      v_route.source_route_id
    );
  end loop;
end;
$$;

alter table player_api.map_nodes
  alter column confidence_band set not null,
  alter column source_kind set not null,
  alter column freshness set not null,
  alter column privacy set not null,
  add constraint map_nodes_confidence_band_allowed
    check (confidence_band in ('low', 'moderate', 'high', 'very-high')),
  add constraint map_nodes_source_kind_allowed
    check (source_kind in ('system', 'exploration', 'npc', 'player', 'document', 'scene')),
  add constraint map_nodes_source_label_safe
    check (
      source_label is null
      or (
        source_label = btrim(source_label)
        and source_label <> ''
        and char_length(source_label) <= 120
        and source_label !~ '^[[:cntrl:][:space:]]*$'
      )
    ),
  add constraint map_nodes_freshness_allowed
    check (freshness in ('just-updated', 'recent', 'aging', 'stale', 'not-applicable')),
  add constraint map_nodes_privacy_allowed
    check (privacy in ('private', 'shared', 'public'));

alter table player_api.map_routes
  alter column confidence_band set not null,
  alter column source_kind set not null,
  alter column freshness set not null,
  alter column privacy set not null,
  add constraint map_routes_confidence_band_allowed
    check (confidence_band in ('low', 'moderate', 'high', 'very-high')),
  add constraint map_routes_source_kind_allowed
    check (source_kind in ('system', 'exploration', 'npc', 'player', 'document', 'scene')),
  add constraint map_routes_source_label_safe
    check (
      source_label is null
      or (
        source_label = btrim(source_label)
        and source_label <> ''
        and char_length(source_label) <= 120
        and source_label !~ '^[[:cntrl:][:space:]]*$'
      )
    ),
  add constraint map_routes_freshness_allowed
    check (freshness in ('just-updated', 'recent', 'aging', 'stale', 'not-applicable')),
  add constraint map_routes_privacy_allowed
    check (privacy in ('private', 'shared', 'public'));

alter table player_api.map_nodes
  drop column confidence;

create function world_private.refresh_world_knowledge_metadata_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, world_private, server_api
as $$
declare
  v_location record;
  v_route record;
begin
  if new.current_world_minute is not distinct from old.current_world_minute then
    return new;
  end if;

  for v_location in
    select knowledge.owner_user_id,
           knowledge.source_location_id
      from world_private.player_location_knowledge as knowledge
      join world_private.locations as location
        on location.id = knowledge.source_location_id
     where location.world_id = new.id
  loop
    perform server_api.refresh_player_node_knowledge_metadata_v1(
      v_location.owner_user_id,
      v_location.source_location_id
    );
  end loop;

  for v_route in
    select knowledge.owner_user_id,
           knowledge.source_route_id
      from world_private.player_route_knowledge as knowledge
      join world_private.routes as route
        on route.id = knowledge.source_route_id
     where route.world_id = new.id
  loop
    perform server_api.refresh_player_route_projection_v1(
      v_route.owner_user_id,
      v_route.source_route_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function world_private.refresh_world_knowledge_metadata_v1()
  from public, anon, authenticated;
grant execute on function world_private.refresh_world_knowledge_metadata_v1()
  to service_role;

create trigger world_minute_knowledge_metadata_refresh
  after update of current_world_minute on world_private.worlds
  for each row execute function world_private.refresh_world_knowledge_metadata_v1();

create function server_api.advance_world_minute_v1(
  p_world_id uuid,
  p_new_world_minute bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, world_private
as $$
declare
  v_current_world_minute bigint;
begin
  if p_new_world_minute is null or p_new_world_minute < 0 then
    raise exception using errcode = '22023', message = 'invalid_world_minute';
  end if;

  select current_world_minute
    into v_current_world_minute
    from world_private.worlds
   where id = p_world_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'world_not_found';
  end if;

  if p_new_world_minute < v_current_world_minute then
    raise exception using errcode = '22023', message = 'world_minute_regression';
  end if;

  update world_private.worlds
     set current_world_minute = p_new_world_minute
   where id = p_world_id;
end;
$$;

revoke all on function server_api.advance_world_minute_v1(uuid, bigint)
  from public, anon, authenticated;
grant execute on function server_api.advance_world_minute_v1(uuid, bigint)
  to service_role;

commit;