begin;

alter type world_private.knowledge_state rename value 'clue' to 'indication';
alter type world_private.knowledge_state rename value 'located' to 'localized';

update player_api.map_nodes
set knowledge_state = case knowledge_state
  when 'clue' then 'indication'
  when 'located' then 'localized'
  else knowledge_state
end
where knowledge_state in ('clue', 'located');

update player_api.map_routes
set knowledge_state = case knowledge_state
  when 'clue' then 'indication'
  when 'located' then 'localized'
  else knowledge_state
end
where knowledge_state in ('clue', 'located');

alter table player_api.map_nodes
  drop constraint if exists map_nodes_knowledge_state_check;

alter table player_api.map_nodes
  add constraint map_nodes_knowledge_state_check
  check (
    knowledge_state in (
      'rumor',
      'indication',
      'localized',
      'confirmed',
      'investigated',
      'understood'
    )
  );

alter table player_api.map_routes
  drop constraint if exists map_routes_knowledge_state_check;

alter table player_api.map_routes
  add constraint map_routes_knowledge_state_check
  check (
    knowledge_state in (
      'rumor',
      'indication',
      'localized',
      'confirmed',
      'investigated',
      'understood'
    )
  );

commit;
