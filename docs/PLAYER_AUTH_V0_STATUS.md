# Player Auth + Projection Boundary V0 — Gate 8B checkpoint

## Estado

Gate 8B está **implementation-complete** e com evidência funcional/security GREEN no head `e79f195d959d49432af30dc5d63398963ece7567`.

A declaração de fechamento técnico definitivo depende apenas de o commit documental deste checkpoint permanecer verde no CI permanente. A PR #10 continua **DRAFT / OPEN / UNMERGED**.

- Branch: `foundation/player-auth-v0`
- Base: `foundation/player-knowledge-v0`
- PR: `#10`
- Head funcional verificado: `e79f195d959d49432af30dc5d63398963ece7567`
- CI funcional: run `33342017902` (#416)
- `quality`: SUCCESS
- `database`: SUCCESS

## Contrato de autenticação

- Supabase Auth server-side.
- Cadastro público global bloqueado por `[auth].enable_signup = false`.
- Provider de e-mail habilitado para jogadores previamente provisionados por `[auth.email].enable_signup = true`.
- Fluxo público continua invite-only: a aplicação usa `shouldCreateUser: false` ao solicitar OTP.
- OTP numérico de 6 dígitos.
- Expiração do OTP: 600 segundos.
- Intervalo mínimo de reenvio: 60 segundos.
- SSR/cookies via `@supabase/ssr`.
- Identidade autorizadora resolvida por claims server-side e convertida em `PlayerSession` provider-neutral.
- Nenhum Supabase browser client neste corte.

### Correção validada durante o fechamento

O primeiro smoke com sessão Auth real falhou com `email_provider_disabled`. A causa raiz era `[auth.email].enable_signup = false`, que desligava o provider de e-mail junto com o cadastro. O contrato foi separado corretamente:

- `[auth].enable_signup = false` mantém o projeto invite-only;
- `[auth.email].enable_signup = true` permite autenticação por e-mail de usuários já provisionados.

O comportamento está protegido por teste de configuração e pelo smoke Auth real no CI.

## Boundary de MapProjection

`GET /api/map-projection` é o boundary autenticado do player.

Garantias do corte:

- não recebe `playerId` por argumento, query string, body ou outro parâmetro de identidade;
- a identidade vem exclusivamente da sessão autenticada resolvida server-side;
- sessão ausente retorna `401`;
- sucesso retorna `200` com JSON de `MapProjection`;
- `Cache-Control` é `private, no-store`;
- falhas da projection source retornam erro sanitizado sem ecoar payload de banco;
- a source lê somente `player_api.map_nodes` e `player_api.map_routes`;
- ambas as consultas aplicam filtro explícito `owner_user_id = playerId`, além da RLS;
- geometrias e linhas de banco são validadas em runtime e falham fechadas;
- coordenadas permanecem em world-units canônicas;
- o resultado passa pelo schema estrito de `MapProjection`;
- o resultado passa por guard recursivo anti-vazamento antes de sair do servidor.

## Evidência A/B com Auth real

O job `database` do run `33342017902` provou, contra Supabase local reconstruído do Git:

- 53 testes permanentes de banco/RLS: PASS;
- smoke PostgREST legado: PASS;
- cadastro público anônimo: bloqueado;
- usuários Auth A/B criados com os UUIDs determinísticos das fixtures;
- sessões reais A/B emitidas pelo Auth server;
- acesso anônimo a `player_api`: negado;
- jogador A recebe somente sua projeção autorizada;
- jogador A tentando filtrar explicitamente `owner_user_id = PLAYER_B` recebe zero linhas;
- jogador B recebe somente sua projeção autorizada;
- `world_private` permanece inacessível ao jogador autenticado;
- tipos de banco regenerados continuam equivalentes ao arquivo versionado.

Mensagem permanente do smoke:

`Player Auth projection smoke passed: invite-only Auth is enforced and real A/B sessions remain isolated by player_api RLS.`

## Auditoria de atalhos proibidos

A varredura do player app não encontrou uso de:

- `getSession(` como prova server-side de autorização;
- `service_role`, `SUPABASE_SERVICE` ou `SUPABASE_SECRET`;
- leitura de `world_private`;
- `createBrowserClient`.

A UI não decide identidade, autorização ou conhecimento do jogador.

## Evidência do job quality

No mesmo run `33342017902`:

- format: PASS;
- lint: PASS;
- typecheck: PASS;
- unit tests: PASS (`110/110`);
- build: PASS.

## Fora do escopo / próximos cortes da Fase 8

O fechamento do 8B não encerra a Fase 8 inteira. Permanecem para cortes posteriores:

- completar as camadas semânticas de renderer/player presentation previstas no plano, incluindo SVG/React onde aplicável sobre a fundação de mapa existente;
- graus de conhecimento de rotas;
- detalhes progressivos de nodes;
- notas do jogador;
- compartilhamento controlado de conhecimento;
- refinamento mobile/player UX.

## Regra de fechamento

Este documento registra a evidência funcional do head `e79f195d959d49432af30dc5d63398963ece7567`. O Gate 8B só deve ser marcado como **tecnicamente fechado** após o commit documental que contém este checkpoint obter `quality = success` e `database = success` no CI permanente. Depois disso, a PR #10 deve ser atualizada com o head/run final, permanecendo draft e sem merge.
