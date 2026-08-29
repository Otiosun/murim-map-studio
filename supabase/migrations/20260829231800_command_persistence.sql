begin;

-- Trusted server mutations get their own PostgREST surface. Private world truth
-- remains outside the Data API; browser roles receive no schema usage here.
create schema if not exists server_api;
revoke all on schema server_api from public, anon, authenticated;
grant usage on schema server_api to service_role;

alter default privileges in schema server_api revoke execute on functions from public;
alter default privileges in schema server_api grant execute on functions to service_role;

-- Revisions are persistence concerns used for optimistic concurrency. Domain IDs
-- and command semantics remain renderer/database independent.
alter table world_private.locations
  add column revision bigint not null default 1 check (revision > 0);

alter table world_private.routes
  add column revision bigint not null default 1 check (revision > 0);

create table world_private.world_event_ledger (
  event_id text primary key check (btrim(event_id) <> ''),
  world_id uuid not null references world_private.worlds(id) on delete restrict,
  entity_id uuid not null,
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_revision bigint not null check (entity_revision > 0),
  event_kind text not null check (btrim(event_kind) <> ''),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default timezone('utc', now()),
  actor_kind text not null check (actor_kind in ('user', 'system', 'entity')),
  actor_ref text not null check (btrim(actor_ref) <> ''),
  source text not null check (source in ('studio', 'system', 'scene', 'import', 'test')),
  correlation_id text not null check (btrim(correlation_id) <> ''),
  schema_version integer not null check (schema_version > 0),
  payload jsonb not null,
  commit_fingerprint jsonb not null
);

create index world_event_ledger_world_time_idx
  on world_private.world_event_ledger (world_id, occurred_at, event_id);
create index world_event_ledger_correlation_idx
  on world_private.world_event_ledger (correlation_id);
create index world_event_ledger_entity_idx
  on world_private.world_event_ledger (entity_id, entity_revision);

-- Default privileges from the private schema grant service_role broad access;
-- narrow the immutable ledger back to append/read only.
revoke update, delete, truncate on world_private.world_event_ledger from service_role;
grant select, insert on world_private.world_event_ledger to service_role;

create function world_private.reject_world_event_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'world_event_ledger is append-only';
end;
$$;

create trigger world_event_ledger_append_only
before update or delete on world_private.world_event_ledger
for each row execute function world_private.reject_world_event_ledger_mutation();

revoke all on function world_private.reject_world_event_ledger_mutation()
  from public, anon, authenticated, service_role;

-- This adapter does not decide whether a command is valid. The TypeScript domain
-- engine validates commands first. This function atomically persists the already
-- validated Location state and its audit event, with optimistic concurrency and
-- idempotency. Secret payload is intentionally preserved on updates.
create function server_api.commit_location_state_v1(
  p_event_id text,
  p_world_id uuid,
  p_location_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_event_kind text,
  p_actor_kind text,
  p_actor_ref text,
  p_source text,
  p_correlation_id text,
  p_occurred_at timestamptz,
  p_event_schema_version integer,
  p_event_payload jsonb,
  p_name text default null,
  p_kind text default null,
  p_x double precision default null,
  p_y double precision default null,
  p_area_id uuid default null,
  p_is_secret boolean default null,
  p_payload jsonb default null
)
returns table(applied boolean, committed_revision bigint)
language plpgsql
security definer
set search_path = pg_catalog, world_private, extensions
as $$
declare
  v_existing world_private.world_event_ledger%rowtype;
  v_current_revision bigint;
  v_committed_revision bigint;
  v_point extensions.geometry;
  v_fingerprint jsonb;
begin
  if p_event_id is null or btrim(p_event_id) = ''
    or p_correlation_id is null or btrim(p_correlation_id) = ''
    or p_actor_ref is null or btrim(p_actor_ref) = ''
    or p_event_kind is null or btrim(p_event_kind) = ''
    or p_occurred_at is null
    or p_event_schema_version is null or p_event_schema_version <= 0
    or p_event_payload is null then
    raise exception using errcode = '22023', message = 'invalid command persistence metadata';
  end if;

  if p_actor_kind not in ('user', 'system', 'entity') then
    raise exception using errcode = '22023', message = 'invalid actor_kind';
  end if;

  if p_source not in ('studio', 'system', 'scene', 'import', 'test') then
    raise exception using errcode = '22023', message = 'invalid command source';
  end if;

  if p_action not in ('create', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'invalid location persistence action';
  end if;

  v_fingerprint := jsonb_build_object(
    'action', p_action,
    'expectedRevision', p_expected_revision,
    'name', p_name,
    'kind', p_kind,
    'x', p_x,
    'y', p_y,
    'areaId', p_area_id,
    'isSecret', p_is_secret,
    'payload', p_payload
  );

  select *
    into v_existing
    from world_private.world_event_ledger
   where event_id = p_event_id;

  if found then
    if v_existing.world_id is distinct from p_world_id
      or v_existing.entity_id is distinct from p_location_id
      or v_existing.entity_type is distinct from 'location'
      or v_existing.event_kind is distinct from p_event_kind
      or v_existing.occurred_at is distinct from p_occurred_at
      or v_existing.actor_kind is distinct from p_actor_kind
      or v_existing.actor_ref is distinct from p_actor_ref
      or v_existing.source is distinct from p_source
      or v_existing.correlation_id is distinct from p_correlation_id
      or v_existing.schema_version is distinct from p_event_schema_version
      or v_existing.payload is distinct from p_event_payload
      or v_existing.commit_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = '23505', message = 'event_id_conflict';
    end if;

    return query select false, v_existing.entity_revision;
    return;
  end if;

  if not exists (select 1 from world_private.worlds where id = p_world_id) then
    raise exception using errcode = '23503', message = 'world_not_found';
  end if;

  if p_action in ('create', 'update') then
    if p_name is null or btrim(p_name) = ''
      or p_kind is null or btrim(p_kind) = ''
      or p_x is null or p_y is null
      or p_x::text in ('Infinity', '-Infinity', 'NaN')
      or p_y::text in ('Infinity', '-Infinity', 'NaN')
      or p_is_secret is null
      or p_payload is null then
      raise exception using errcode = '22023', message = 'invalid location state';
    end if;

    if p_area_id is not null and not exists (
      select 1 from world_private.areas
       where id = p_area_id and world_id = p_world_id
    ) then
      raise exception using errcode = '23503', message = 'area_not_in_world';
    end if;

    v_point := extensions.st_setsrid(extensions.st_makepoint(p_x, p_y), 0);
  end if;

  if p_action = 'create' then
    if p_expected_revision is not null then
      raise exception using errcode = '22023', message = 'create_requires_null_expected_revision';
    end if;

    if exists (select 1 from world_private.locations where id = p_location_id) then
      raise exception using errcode = '23505', message = 'location_already_exists';
    end if;

    insert into world_private.locations (
      id, world_id, area_id, name, kind, geom, is_secret, payload,
      created_at, updated_at, revision
    ) values (
      p_location_id, p_world_id, p_area_id, p_name, p_kind, v_point, p_is_secret, p_payload,
      p_occurred_at, p_occurred_at, 1
    );
    v_committed_revision := 1;

  elsif p_action = 'update' then
    if p_expected_revision is null then
      raise exception using errcode = '22023', message = 'update_requires_expected_revision';
    end if;

    select revision
      into v_current_revision
      from world_private.locations
     where id = p_location_id and world_id = p_world_id
     for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'location_not_found';
    end if;

    if v_current_revision <> p_expected_revision then
      raise exception using
        errcode = '40001',
        message = format('revision_conflict: expected %s, found %s', p_expected_revision, v_current_revision);
    end if;

    update world_private.locations
       set area_id = p_area_id,
           name = p_name,
           kind = p_kind,
           geom = v_point,
           is_secret = p_is_secret,
           payload = p_payload,
           updated_at = p_occurred_at,
           revision = revision + 1
     where id = p_location_id
     returning revision into v_committed_revision;

    -- A MoveEntity is one domain action. Keep connected route endpoints coherent
    -- in the same database transaction and bump their persistence revisions.
    update world_private.routes
       set geom = case
         when from_location_id = p_location_id
           then extensions.st_setpoint(geom, 0, v_point)
         when to_location_id = p_location_id
           then extensions.st_setpoint(geom, extensions.st_npoints(geom) - 1, v_point)
         else geom
       end,
       updated_at = p_occurred_at,
       revision = revision + 1
     where from_location_id = p_location_id or to_location_id = p_location_id;

  else
    if p_expected_revision is null then
      raise exception using errcode = '22023', message = 'delete_requires_expected_revision';
    end if;

    select revision
      into v_current_revision
      from world_private.locations
     where id = p_location_id and world_id = p_world_id
     for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'location_not_found';
    end if;

    if v_current_revision <> p_expected_revision then
      raise exception using
        errcode = '40001',
        message = format('revision_conflict: expected %s, found %s', p_expected_revision, v_current_revision);
    end if;

    if exists (
      select 1 from world_private.routes
       where from_location_id = p_location_id or to_location_id = p_location_id
    ) then
      raise exception using errcode = '23503', message = 'location_has_routes';
    end if;

    v_committed_revision := v_current_revision + 1;
    delete from world_private.locations where id = p_location_id;
  end if;

  insert into world_private.world_event_ledger (
    event_id,
    world_id,
    entity_id,
    entity_type,
    entity_revision,
    event_kind,
    occurred_at,
    actor_kind,
    actor_ref,
    source,
    correlation_id,
    schema_version,
    payload,
    commit_fingerprint
  ) values (
    p_event_id,
    p_world_id,
    p_location_id,
    'location',
    v_committed_revision,
    p_event_kind,
    p_occurred_at,
    p_actor_kind,
    p_actor_ref,
    p_source,
    p_correlation_id,
    p_event_schema_version,
    p_event_payload,
    v_fingerprint
  );

  return query select true, v_committed_revision;
end;
$$;

revoke all on function server_api.commit_location_state_v1(
  text, uuid, uuid, text, bigint, text, text, text, text, text,
  timestamptz, integer, jsonb, text, text, double precision, double precision,
  uuid, boolean, jsonb
) from public, anon, authenticated;

grant execute on function server_api.commit_location_state_v1(
  text, uuid, uuid, text, bigint, text, text, text, text, text,
  timestamptz, integer, jsonb, text, text, double precision, double precision,
  uuid, boolean, jsonb
) to service_role;

commit;
