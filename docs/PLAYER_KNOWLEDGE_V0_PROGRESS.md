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

Implementação funcional concluída na branch `foundation/player-renderer-v0` sobre o boundary seguro do 8B.

- renderer inicial em SVG/React server-side, conforme ADR-005;
- `MapProjection` permanece como único contrato de entrada visual;
- helper puro calcula viewport determinístico em world-units;
- ghost nodes usam somente a posição aproximada e o raio de incerteza já autorizados;
- routes, known nodes, ghost nodes e labels autorizados são renderizados sem consultar world truth;
- empty state e projection unavailable state são tratados explicitamente;
- falhas de projection source são sanitizadas antes da UI;
- home autenticada usa exclusivamente `session.playerId` server-side;
- nenhum Supabase browser client, service role, query de `world_private` ou identidade fornecida pela request foi introduzido;
- CSS Foundation responsivo foi adicionado sem pan/zoom, detalhes interativos ou dependência gráfica nova;
- 24 arquivos de testes / 122 testes unitários verdes no CI funcional;
- 53 testes de banco/RLS, PostgREST leakage smoke e Auth A/B smoke verdes no CI funcional.

Evidência funcional do 8C:

- head funcional: `4be3b93765f69b6bb7a192ac482789375f2efefa`;
- CI funcional: run `33356141753` (#446);
- job `quality`: SUCCESS;
- job `database`: SUCCESS.

Checkpoint detalhado: `docs/PLAYER_RENDERER_V0_STATUS.md`.

O 8C está **implementation-complete**. O fechamento técnico definitivo depende somente de o commit documental deste checkpoint permanecer verde no CI permanente. Depois disso, a PR do corte deve ser criada/atualizada como draft e permanecer sem merge.

## Fase 8 — restante

O fechamento de 8A, 8B e 8C não encerra o Gate 8 inteiro. Permanecem para cortes posteriores:

- graus de conhecimento de rotas;
- detalhe progressivo de nodes;
- confiança, origem, frescor e privacidade em apresentação onde aplicável;
- notas do jogador;
- compartilhamento controlado de conhecimento;
- interações mobile/touch e eventual pan/zoom.
