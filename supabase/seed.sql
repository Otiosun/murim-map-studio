-- Deterministic development/test seed. Schema changes belong in migrations only.

insert into app_private.user_roles (user_id, role)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'narrator'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'admin');

insert into world_private.worlds (id, slug, name, schema_version)
values (
  '10000000-0000-4000-8000-000000000001',
  'outer-ring-v0',
  'Círculo Exterior — Mundo de Teste',
  1
);

insert into world_private.rings (
  id,
  world_id,
  name,
  ordinal,
  center,
  inner_radius,
  outer_radius,
  secret_payload
)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Círculo Exterior',
  0,
  extensions.st_setsrid(extensions.st_makepoint(0, 0), 0),
  0,
  5000,
  '{"gmNote":"inner boundaries intentionally absent in V0"}'::jsonb
);

insert into world_private.sectors (id, world_id, ring_id, name, boundary)
values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Qinghe',
  extensions.st_multi(
    extensions.st_geomfromtext('POLYGON((0 0, 1600 0, 1600 1600, 0 1600, 0 0))', 0)
  )
);

insert into world_private.areas (id, world_id, sector_id, name, boundary)
values (
  '13000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'Vale de Qinghe',
  extensions.st_multi(
    extensions.st_geomfromtext('POLYGON((50 50, 1500 50, 1500 1500, 50 1500, 50 50))', 0)
  )
);

insert into world_private.locations (
  id,
  world_id,
  area_id,
  name,
  kind,
  geom,
  is_secret,
  payload,
  secret_payload
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'Vila Qinghe',
    'settlement',
    extensions.st_setsrid(extensions.st_makepoint(100, 120), 0),
    false,
    '{"tags":["social","market"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'Mosteiro Sob as Raízes',
    'hidden-site',
    extensions.st_setsrid(extensions.st_makepoint(900, 900), 0),
    true,
    '{"tags":["ruin"]}'::jsonb,
    '{"entrance":"under the north root","occupants":"unknown cultivators"}'::jsonb
  );

insert into world_private.routes (
  id,
  world_id,
  from_location_id,
  to_location_id,
  name,
  geom,
  secret_payload
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'Trilha Coberta',
  extensions.st_geomfromtext('LINESTRING(100 120, 420 460, 900 900)', 0),
  '{"knownOnlyBy":"authorized knowledge"}'::jsonb
);

-- Player A knows the village and only a vague rumor about the secret site.
insert into world_private.player_location_knowledge (
  owner_user_id,
  source_location_id,
  projection_id,
  state,
  confidence,
  origin_kind,
  origin_label,
  approximate_geom,
  learned_at,
  refreshed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '20000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'confirmed',
    1.0,
    'personal-exploration',
    'arrival',
    extensions.st_setsrid(extensions.st_makepoint(100, 120), 0),
    '2026-08-29T12:00:00Z',
    '2026-08-29T12:00:00Z'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '20000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'rumor',
    0.35,
    'npc-rumor',
    'mercador desconhecido',
    extensions.st_setsrid(extensions.st_makepoint(820, 860), 0),
    '2026-08-29T13:00:00Z',
    '2026-08-29T13:00:00Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '20000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'confirmed',
    1.0,
    'shared-map',
    'contato confiável',
    extensions.st_setsrid(extensions.st_makepoint(100, 120), 0),
    '2026-08-29T12:30:00Z',
    '2026-08-29T12:30:00Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '20000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'investigated',
    0.95,
    'personal-exploration',
    'investigação própria',
    extensions.st_setsrid(extensions.st_makepoint(900, 900), 0),
    '2026-08-29T14:00:00Z',
    '2026-08-29T15:00:00Z'
  );

-- Safe projection rows are deliberately independent from canonical IDs.
insert into player_api.map_nodes (
  owner_user_id,
  projection_id,
  kind,
  label,
  knowledge_state,
  confidence,
  geom,
  details,
  updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '91000000-0000-4000-8000-000000000001',
    'settlement',
    'Vila Qinghe',
    'confirmed',
    1.0,
    extensions.st_setsrid(extensions.st_makepoint(100, 120), 0),
    '{"source":"personal-exploration"}'::jsonb,
    '2026-08-29T12:00:00Z'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '91000000-0000-4000-8000-000000000002',
    'unknown-signal',
    'Rumor: presença incomum ao nordeste',
    'rumor',
    0.35,
    extensions.st_setsrid(extensions.st_makepoint(820, 860), 0),
    '{"source":"npc-rumor","precision":"approximate"}'::jsonb,
    '2026-08-29T13:00:00Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '92000000-0000-4000-8000-000000000001',
    'settlement',
    'Vila Qinghe',
    'confirmed',
    1.0,
    extensions.st_setsrid(extensions.st_makepoint(100, 120), 0),
    '{"source":"shared-map"}'::jsonb,
    '2026-08-29T12:30:00Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '92000000-0000-4000-8000-000000000002',
    'hidden-site',
    'Mosteiro Sob as Raízes',
    'investigated',
    0.95,
    extensions.st_setsrid(extensions.st_makepoint(900, 900), 0),
    '{"source":"personal-exploration","precision":"confirmed"}'::jsonb,
    '2026-08-29T15:00:00Z'
  );
