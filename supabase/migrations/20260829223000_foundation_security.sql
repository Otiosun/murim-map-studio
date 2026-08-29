begin;

-- Spatial functions live outside application schemas. The fictional world uses
-- Cartesian coordinates (SRID 0), never latitude/longitude.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- Private schemas are deliberately absent from the Data API schema list.
create schema if not exists app_private;
create schema if not exists world_private;
create schema if not exists player_api;

revoke create on schema public from public;
revoke all on schema app_private from public, anon, authenticated;
revoke all on schema world_private from public, anon, authenticated;
revoke all on schema player_api from public, anon;

grant usage on schema app_private to service_role;
grant usage on schema world_private to service_role;
grant usage on schema player_api to authenticated, service_role;

-- Application roles are authorization metadata. Direct browser clients remain
-- authenticated users; narrator/admin elevation is consumed by trusted server code.
create type app_private.app_role as enum ('narrator', 'admin');

create table app_private.user_roles (
  user_id uuid primary key,
  role app_private.app_role not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table world_private.worlds (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  schema_version integer not null check (schema_version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table world_private.rings (
  id uuid primary key,
  world_id uuid not null references world_private.worlds(id) on delete cascade,
  name text not null,
  ordinal integer not null check (ordinal >= 0),
  center extensions.geometry(Point, 0) not null,
  inner_radius double precision not null check (inner_radius >= 0),
  outer_radius double precision not null check (outer_radius > 0),
  secret_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (world_id, ordinal),
  check (outer_radius > inner_radius),
  check (extensions.st_srid(center) = 0)
);

create table world_private.sectors (
  id uuid primary key,
  world_id uuid not null references world_private.worlds(id) on delete cascade,
  ring_id uuid not null references world_private.rings(id) on delete cascade,
  name text not null,
  boundary extensions.geometry(MultiPolygon, 0),
  secret_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (boundary is null or extensions.st_srid(boundary) = 0)
);

create table world_private.areas (
  id uuid primary key,
  world_id uuid not null references world_private.worlds(id) on delete cascade,
  sector_id uuid references world_private.sectors(id) on delete set null,
  name text not null,
  boundary extensions.geometry(MultiPolygon, 0),
  secret_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (boundary is null or extensions.st_srid(boundary) = 0)
);

create table world_private.locations (
  id uuid primary key,
  world_id uuid not null references world_private.worlds(id) on delete cascade,
  area_id uuid references world_private.areas(id) on delete set null,
  name text not null,
  kind text not null,
  geom extensions.geometry(Point, 0) not null,
  is_secret boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  secret_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (extensions.st_srid(geom) = 0)
);

create table world_private.routes (
  id uuid primary key,
  world_id uuid not null references world_private.worlds(id) on delete cascade,
  from_location_id uuid not null references world_private.locations(id) on delete cascade,
  to_location_id uuid not null references world_private.locations(id) on delete cascade,
  name text,
  geom extensions.geometry(LineString, 0) not null,
  payload jsonb not null default '{}'::jsonb,
  secret_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (from_location_id <> to_location_id),
  check (extensions.st_srid(geom) = 0)
);

create type world_private.knowledge_state as enum (
  'rumor',
  'clue',
  'located',
  'confirmed',
  'investigated',
  'understood'
);

-- This table maps canonical IDs to player-local projection IDs. It is private
-- precisely because the mapping itself would reveal hidden world truth.
create table world_private.player_location_knowledge (
  owner_user_id uuid not null,
  source_location_id uuid not null references world_private.locations(id) on delete cascade,
  projection_id uuid not null,
  state world_private.knowledge_state not null,
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  origin_kind text not null,
  origin_label text,
  approximate_geom extensions.geometry(Point, 0),
  learned_at timestamptz not null,
  refreshed_at timestamptz not null,
  primary key (owner_user_id, source_location_id),
  unique (owner_user_id, projection_id),
  check (approximate_geom is null or extensions.st_srid(approximate_geom) = 0)
);

-- Player-facing projection tables contain only sanitized, player-local IDs.
-- There is intentionally no canonical entity ID or hidden payload column here.
create table player_api.map_nodes (
  owner_user_id uuid not null,
  projection_id uuid not null,
  kind text not null,
  label text not null,
  knowledge_state text not null check (
    knowledge_state in ('rumor', 'clue', 'located', 'confirmed', 'investigated', 'understood')
  ),
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  geom extensions.geometry(Point, 0),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_user_id, projection_id),
  check (geom is null or extensions.st_srid(geom) = 0)
);

create table player_api.map_routes (
  owner_user_id uuid not null,
  projection_id uuid not null,
  from_projection_id uuid not null,
  to_projection_id uuid not null,
  label text,
  knowledge_state text not null,
  geom extensions.geometry(LineString, 0),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_user_id, projection_id),
  foreign key (owner_user_id, from_projection_id)
    references player_api.map_nodes(owner_user_id, projection_id) on delete cascade,
  foreign key (owner_user_id, to_projection_id)
    references player_api.map_nodes(owner_user_id, projection_id) on delete cascade,
  check (from_projection_id <> to_projection_id),
  check (geom is null or extensions.st_srid(geom) = 0)
);

create index locations_geom_gist on world_private.locations using gist (geom);
create index routes_geom_gist on world_private.routes using gist (geom);
create index areas_boundary_gist on world_private.areas using gist (boundary);
create index sectors_boundary_gist on world_private.sectors using gist (boundary);
create index map_nodes_owner_idx on player_api.map_nodes (owner_user_id);
create index map_nodes_geom_gist on player_api.map_nodes using gist (geom);
create index map_routes_owner_idx on player_api.map_routes (owner_user_id);
create index map_routes_geom_gist on player_api.map_routes using gist (geom);

-- Private truth is server-only. service_role is the system boundary; browser
-- clients never receive this key.
grant all on all tables in schema app_private to service_role;
grant all on all tables in schema world_private to service_role;
grant all on all sequences in schema app_private to service_role;
grant all on all sequences in schema world_private to service_role;

alter default privileges in schema app_private grant all on tables to service_role;
alter default privileges in schema world_private grant all on tables to service_role;
alter default privileges in schema app_private grant all on sequences to service_role;
alter default privileges in schema world_private grant all on sequences to service_role;

-- Exposed schema: reachability is explicit, mutation is not granted to clients.
revoke all on all tables in schema player_api from anon, authenticated;
grant select on player_api.map_nodes, player_api.map_routes to authenticated;
grant all on all tables in schema player_api to service_role;

alter default privileges in schema player_api revoke all on tables from anon, authenticated;
alter default privileges in schema player_api grant all on tables to service_role;

alter table player_api.map_nodes enable row level security;
alter table player_api.map_nodes force row level security;
alter table player_api.map_routes enable row level security;
alter table player_api.map_routes force row level security;

create policy map_nodes_select_own
  on player_api.map_nodes
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

create policy map_routes_select_own
  on player_api.map_routes
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

-- Map assets are presentation data and have a policy separate from world truth.
-- No direct client write policy exists; uploads will go through trusted server code.
drop policy if exists map_assets_read_authenticated on storage.objects;
create policy map_assets_read_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'map-assets');

commit;
