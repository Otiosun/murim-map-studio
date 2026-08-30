begin;

alter table world_private.player_location_knowledge
  add column approximate_radius double precision;

alter table world_private.player_location_knowledge
  add constraint player_location_knowledge_approximate_radius_positive
  check (approximate_radius is null or approximate_radius > 0);

alter table player_api.map_nodes
  add column role text not null default 'known',
  add column approximate_radius double precision;

alter table player_api.map_nodes
  add constraint map_nodes_role_allowed
    check (role in ('known', 'ghost')),
  add constraint map_nodes_approximate_radius_positive
    check (approximate_radius is null or approximate_radius > 0),
  add constraint map_nodes_role_uncertainty_coherent
    check (
      (role = 'known' and approximate_radius is null)
      or (role = 'ghost' and approximate_radius is not null and approximate_radius > 0)
    );

commit;
