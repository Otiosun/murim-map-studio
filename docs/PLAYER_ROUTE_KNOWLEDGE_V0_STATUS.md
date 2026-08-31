# Player Route Knowledge V0 status

Status: **CLOSED — Gate 8D**

Branch: `foundation/player-route-knowledge-v0`

Base canônica: Gate 8C final `68bdd424348822e297ad4803367a16243dddb070`.

## Boundary de dados

O conhecimento individual de rotas agora possui uma camada privada própria em `world_private.player_route_knowledge`. O vínculo com a rota canônica permanece somente em `world_private`; o jogador continua recebendo exclusivamente linhas já sanitizadas em `player_api.map_routes`.

A materialização é feita por `server_api.refresh_player_route_projection_v1`, disponível apenas para a fronteira confiável de servidor. O cliente autenticado não pode chamar essa função nem consultar o schema privado.

## Regra de precisão

- `rumor`, `indication` e `localized`: a geometria exposta é topológica e usa somente as posições já autorizadas dos endpoints na projeção daquele jogador.
- Endpoint ghost: usa o centro aproximado já autorizado do ghost.
- `confirmed`, `investigated` e `understood`: a geometria canônica só pode ser materializada quando ambos os endpoints possuem posição exata autorizada.
- Rota de estado alto com endpoint ghost: faz fallback para topologia segura.
- Endpoint ausente da projeção: a rota não é exposta.

Portanto, a precisão da rota nunca supera a precisão autorizada de seus endpoints.

## Anti-vazamento

`player_api.map_routes` mantém somente IDs locais da projeção e a geometria que já é segura para aquele jogador. Não há `source_route_id`, canonical route ID, `from_location_id`, `to_location_id` ou payload privado na superfície do player.

O guard recursivo de `MapProjection` foi ampliado para rejeitar aliases equivalentes desses identificadores. O renderer continua passivo: desenha exatamente o `route.path` autorizado e não reconstrói world truth.

## Apresentação

Os seis estados de conhecimento de rota possuem metadados e diferenciação visual no SVG/React:

`rumor → indication → localized → confirmed → investigated → understood`.

Esses estilos são somente apresentação; nenhuma informação é protegida por CSS.

## Provas finais

Head de implementação verde: `18870a4fb2cd7e6f0132f52c1eefabf3e7e269e9`.

CI #478 / run `33403918101`:

- `quality`: SUCCESS;
- `database`: SUCCESS;
- 25 arquivos / 132 testes unitários PASS;
- 4 arquivos / 75 testes DB/RLS PASS;
- rebuild completo do Supabase a partir de migrations + seed PASS;
- PostgREST leakage smoke PASS: player A recebe apenas topologia segura, enquanto B recebe a geometria exata autorizada;
- Auth A/B real PASS: RLS mantém isolamento e a precisão da rota acompanha o conhecimento autorizado;
- tipos gerados do banco sem drift.

## Estado da Fase 8

8A, 8B, 8C e 8D estão tecnicamente fechados. O Gate 8 completo permanece aberto.

Próximo corte: **8E — detalhe compacto/touch de nodes**.

PixiJS/WebGPU continua deferido; `MapProjection` permanece a fronteira anti-vazamento e o renderer SVG/React continua substituível.
