begin;

create table world_private.player_route_knowledge (
  owner_user_id uuid not null,
  source_route_id uuid not null references world_private.routes(id) on delete cascade,
  projection_id uuid not null,
  state world_private.knowledge_state not null,
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  origin_kind text not null check (btrim(origin_kind) <> ''),
  origin_label text,
  learned_at timestamptz not null,
  refreshed_at timestamptz not null,
  primary key (owner_user_id, source_route_id),
  unique (owner_user_id, projection_id)
);

create index player_route_knowledge_owner_idx
  on world_private.player_route_knowledge (owner_user_id);

revoke all on world_private.player_route_knowledge from public, anon, authenticated;
grant all on world_private.player_route_knowledge to service_role;

create function server_api.refresh_player_route_projection_v1(
  p_owner_user_id uuid,
  p_source_route_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, extensions
as $$
declare
  v_knowledge world_private.player_route_knowledge%rowtype;
  v_route world_private.routes%rowtype;
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
    v_knowledge.refreshed_at
  )
  on conflict (owner_user_id, projection_id) do update
    set from_projection_id = excluded.from_projection_id,
        to_projection_id = excluded.to_projection_id,
        label = excluded.label,
        knowledge_state = excluded.knowledge_state,
        geom = excluded.geom,
        details = excluded.details,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function server_api.refresh_player_route_projection_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function server_api.refresh_player_route_projection_v1(uuid, uuid)
  to service_role;

create function world_private.sync_player_route_knowledge_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, server_api
as $$
begin
  if tg_op = 'DELETE' then
    delete from player_api.map_routes
     where owner_user_id = old.owner_user_id
       and projection_id = old.projection_id;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (
      old.owner_user_id is distinct from new.owner_user_id
      or old.projection_id is distinct from new.projection_id
    ) then
    delete from player_api.map_routes
     where owner_user_id = old.owner_user_id
       and projection_id = old.projection_id;
  end if;

  perform server_api.refresh_player_route_projection_v1(
    new.owner_user_id,
    new.source_route_id
  );
  return new;
end;
$$;

revoke all on function world_private.sync_player_route_knowledge_projection_v1()
  from public, anon, authenticated;

create trigger player_route_knowledge_projection_sync
  after insert or update or delete on world_private.player_route_knowledge
  for each row execute function world_private.sync_player_route_knowledge_projection_v1();

create function world_private.refresh_routes_for_player_node_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, world_private, player_api, server_api
as $$
declare
  v_owner uuid;
  v_projection uuid;
  v_source_location uuid;
  v_route record;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_user_id;
    v_projection := old.projection_id;
  else
    v_owner := new.owner_user_id;
    v_projection := new.projection_id;
  end if;

  select source_location_id
    into v_source_location
    from world_private.player_location_knowledge
   where owner_user_id = v_owner
     and projection_id = v_projection;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  for v_route in
    select knowledge.source_route_id
      from world_private.player_route_knowledge as knowledge
      join world_private.routes as route
        on route.id = knowledge.source_route_id
     where knowledge.owner_user_id = v_owner
       and (
         route.from_location_id = v_source_location
         or route.to_location_id = v_source_location
       )
  loop
    perform server_api.refresh_player_route_projection_v1(
      v_owner,
      v_route.source_route_id
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function world_private.refresh_routes_for_player_node_v1()
  from public, anon, authenticated;

create trigger player_map_node_route_sync_insert_delete
  after insert or delete on player_api.map_nodes
  for each row execute function world_private.refresh_routes_for_player_node_v1();

create trigger player_map_node_route_sync_precision_update
  after update of role, geom on player_api.map_nodes
  for each row execute function world_private.refresh_routes_for_player_node_v1();

commit;
