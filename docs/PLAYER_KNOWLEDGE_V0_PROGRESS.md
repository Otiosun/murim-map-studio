# Player Knowledge V0 progress

## Gate 8A — Player Knowledge core

Gate 8A está tecnicamente fechado na linha `foundation/player-knowledge-v0`.

Este arquivo continua acompanhando o plano canônico em `docs/superpowers/plans/2026-08-30-player-knowledge-core.md`.

- Task 1 — gramática canônica de conhecimento: concluída e revalidada pelo CI permanente.
- Task 2 — ghost nodes com incerteza espacial segura: concluída e revalidada pelo CI permanente.
- Task 3 — builder puro de `MapProjection`: concluída com schema validation, endpoint filtering, ghost radius guard e varredura anti-vazamento.
- Task 4 — prova A/B: concluída em unit tests e smoke PostgREST real.
- Fechamento 8A: commit `3c936d3ac981b453d55343d24aec0ba25d541cf1`.
- Checkpoint detalhado: `docs/PLAYER_KNOWLEDGE_V0_STATUS.md`.

## Gate 8B — Player Auth + Projection Boundary

Gate 8B está tecnicamente fechado na branch `foundation/player-auth-v0`.

- Supabase Auth invite-only com e-mail + OTP numérico de 6 dígitos.
- SSR/cookies e `PlayerSession` provider-neutral.
- login, verificação, logout e home protegida implementados.
- projection source real lê somente `player_api`, filtra pelo player autenticado e falha fechada.
- `MapProjection` validada por schema estrito + guard recursivo anti-vazamento.
- `GET /api/map-projection` autenticado, sem identidade fornecida pela request e com `private, no-store`.
- smoke com sessões Auth reais A/B integrado ao CI.
- A não consegue forçar projeção de B.
- acesso anônimo a `player_api` é negado.
- `world_private` permanece inacessível ao player.
- 53 testes de banco/RLS verdes.
- tipos gerados do banco permanecem atuais.

Evidência final do 8B:

- head documental final: `fd1f11ddf1771b9cc16dca68f2cf109c3b5ac435`;
- CI final: run `33342293159` (#420);
- job `quality`: SUCCESS;
- job `database`: SUCCESS;
- PR #10: draft/open/unmerged.

Checkpoint detalhado: `docs/PLAYER_AUTH_V0_STATUS.md`.

## Gate 8C — Player Renderer

Gate 8C está tecnicamente fechado na branch `foundation/player-renderer-v0` sobre o boundary seguro do 8B.

- renderer inicial em SVG/React server-side, conforme ADR-005;
- `MapProjection` permanece como único contrato de entrada visual;
- helper puro calcula viewport determinístico em world-units;
- ghost nodes usam somente a posição aproximada e o raio de incerteza já autorizados;
- routes, known nodes, ghost nodes e labels autorizados são renderizados sem consultar world truth;
- empty state e projection unavailable state são tratados explicitamente;
- falhas de projection source são sanitizadas antes da UI;
- home autenticada usa exclusivamente `session.playerId` server-side;
- nenhum Supabase browser client, service role, query de `world_private` ou identidade fornecida pela request foi introduzido;
- CSS Foundation responsivo foi adicionado sem pan/zoom, detalhes interativos ou dependência gráfica nova.

Evidência final do 8C:

- head final: `68bdd424348822e297ad4803367a16243dddb070`;
- CI final: run `33356404367` (#448);
- job `quality`: SUCCESS;
- job `database`: SUCCESS;
- 24 arquivos / 122 testes unitários;
- 53 testes DB/RLS + PostgREST leakage smoke + Auth A/B smoke;
- PR #11: draft/open/unmerged.

Checkpoint detalhado: `docs/PLAYER_RENDERER_V0_STATUS.md`.

## Gate 8D — Route Knowledge Degrees

Gate 8D está tecnicamente fechado na branch `foundation/player-route-knowledge-v0`.

- `world_private.player_route_knowledge` mantém o vínculo canônico da rota somente no lado privado;
- `server_api.refresh_player_route_projection_v1` materializa a linha já sanitizada em `player_api.map_routes` e não é executável pelo jogador;
- `rumor`, `indication` e `localized` recebem somente uma LineString topológica derivada das posições de nodes já autorizadas ao próprio jogador;
- endpoint ghost usa exclusivamente o centro aproximado autorizado, nunca a posição real;
- `confirmed`, `investigated` e `understood` só podem receber geometria canônica quando os dois endpoints também possuem posição exata autorizada;
- estado alto de rota com endpoint ghost cai para geometria topológica segura, então a rota nunca aumenta a precisão espacial além dos endpoints;
- se qualquer endpoint não existir na projeção do jogador, a rota também não é materializada;
- `player_api.map_routes` expõe apenas IDs locais da projeção; nenhum canonical/source route ID é disponibilizado;
- o renderer continua desenhando exatamente `route.path`, sem reconstruir ou inferir geometria escondida;
- os seis estados de conhecimento possuem diferenciação visual, mas CSS não participa da segurança;
- o guard anti-vazamento também rejeita aliases de IDs canônicos/source/endpoints de rota.

Evidência técnica final do 8D:

- head de implementação verde: `18870a4fb2cd7e6f0132f52c1eefabf3e7e269e9`;
- CI final de implementação: run `33403918101` (#478);
- job `quality`: SUCCESS;
- job `database`: SUCCESS;
- 25 arquivos / 132 testes unitários;
- 4 arquivos / 75 testes DB/RLS;
- PostgREST smoke prova topologia segura para A e geometria exata autorizada para B;
- Auth real A/B prova isolamento de linhas e precisão de geometria por conhecimento;
- tipos TypeScript gerados sem drift.

Checkpoint detalhado: `docs/PLAYER_ROUTE_KNOWLEDGE_V0_STATUS.md`.

## Gate 8E — Player Node Details

Gate 8E está tecnicamente fechado na branch `foundation/player-node-details-v0` sobre o head final do 8D.

- `ProjectionNode.detail` aceita somente `category` e `summary` player-safe, com limites e `trim` determinísticos;
- o adapter de `player_api.map_nodes.details` é estrito e fail-closed; `{}` vira ausência de detalhe e qualquer shape inesperado invalida a projeção inteira;
- nenhum fluxo copia automaticamente payload/secret payload canônico para detalhes do jogador;
- o cliente recebe um view model minimizado com somente ID local da projeção, label, role, estado de conhecimento e detail autorizados;
- selecionar um node não consulta servidor, Supabase, router nem world truth adicional;
- click/pointer/touch sintetizado, Enter e Space abrem o mesmo painel compacto; Escape e `Fechar` encerram a seleção;
- foco retorna ao node selecionado quando possível e cai para a região do explorer se o node tiver saído do DOM;
- `PlayerMapSvg` permanece server-rendered e usa somente IDs locais da projeção como metadata de interação;
- node sem label usa `Local não identificado`; ghost expõe somente o aviso genérico de localização aproximada;
- `aria-pressed` e `data-selected` refletem a seleção, com hover/focus-visible/selected somente como apresentação;
- hit target SVG separado oferece aproximadamente 44 CSS px sem alterar marker, viewport, geometria ou precisão de conhecimento;
- painel é não modal e responsivo; não houve introdução de pan/zoom, Pixi/WebGPU ou nova autoridade de dados.

Evidência funcional final do 8E:

- head funcional verde: `e4b51807fbb1f023e0a9a8000a28e7a95a93a7f4`;
- CI funcional: run `33456259216` (#536);
- job `quality`: SUCCESS;
- job `database`: SUCCESS;
- 28 test files / 180 testes unitários e de componente PASS;
- 4 arquivos / 78 testes DB/RLS PASS;
- rebuild completo do Supabase PASS;
- PostgREST A/B mantém detalhes específicos por jogador e precisão de rota autorizada;
- Auth real A/B mantém detalhes de node e geometria de rota isolados;
- tipos gerados do banco sem drift;
- nenhuma migration nova no 8E.

Checkpoint detalhado: `docs/PLAYER_NODE_DETAILS_V0_STATUS.md`.

O 8E não inclui Playwright, matriz real Chromium/WebKit/Firefox nem validação manual em aparelho físico; esses itens permanecem nos gates de qualidade/E2E apropriados.

## Fase 8 — restante

O fechamento de 8A, 8B, 8C, 8D e 8E não encerra o Gate 8 inteiro.

Próximo corte recomendado: confiança, origem, frescor e privacidade em apresentação segura.

Permanecem para cortes posteriores:

- confiança, origem, frescor e privacidade em apresentação onde aplicável;
- notas do jogador;
- compartilhamento controlado de conhecimento;
- refinamento mobile/touch e eventual pan/zoom.
