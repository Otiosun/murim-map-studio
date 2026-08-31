# Player Renderer V0 — Gate 8C checkpoint

## Estado

Gate 8C está **implementation-complete** e com evidência funcional/security GREEN no head `4be3b93765f69b6bb7a192ac482789375f2efefa`.

A declaração de fechamento técnico definitivo depende apenas de o commit documental deste checkpoint permanecer verde no CI permanente. Nenhum merge ou deploy faz parte deste checkpoint.

- Branch: `foundation/player-renderer-v0`
- Base: `foundation/player-auth-v0`
- Head funcional verificado: `4be3b93765f69b6bb7a192ac482789375f2efefa`
- CI funcional: run `33356141753` (#446)
- `quality`: SUCCESS
- `database`: SUCCESS
- Spec: `docs/superpowers/specs/2026-08-30-player-svg-renderer-design.md`
- Plano: `docs/superpowers/plans/2026-08-30-player-svg-renderer.md`

## Arquitetura entregue

O renderer inicial do player segue o ADR-005: SVG/React server-side sobre `MapProjection`, sem acoplamento do domínio ao renderer visual.

Fluxo efetivo:

`PlayerSession server-side -> player projection source segura -> MapProjection validada -> PlayerMapSvg`

Garantias do corte:

- a página protegida resolve a identidade exclusivamente pela sessão server-side;
- o `session.playerId` é passado diretamente à projection source segura;
- nenhum `playerId` é aceito por query string, body, search param ou prop controlada pelo navegador;
- a página reutiliza o mesmo cliente Supabase request-scoped usado para resolver a sessão;
- não existe fetch HTTP interno para obter a projeção;
- o renderer recebe somente `MapProjection` autorizada;
- nenhuma consulta de banco, autorização ou decisão de identidade ocorre dentro do componente SVG;
- coordenadas continuam em world-units;
- o viewport é calculado deterministicamente a partir apenas da geometria autorizada;
- o renderer não depende de Pixi/WebGPU e permanece substituível sem migrar o modelo de domínio.

## Viewport e geometria

`packages/map-renderer/src/player-viewport.ts` fornece a transformação visual pura usada pelo SVG.

Comportamento coberto:

- nodes e routes participam do auto-fit;
- ghost nodes expandem bounds somente pelo `approximateLocation` autorizado;
- o raio de incerteza participa do viewport;
- projeção vazia usa fallback determinístico `-50 -50 100 100`;
- eixos degenerados são expandidos para evitar `viewBox` de largura/altura zero;
- padding inválido falha explicitamente;
- a projeção de entrada não é mutada.

O helper não reconstrói posição canônica oculta de ghosts e não acessa world truth.

## SVG do jogador

`apps/player/app/player-map-svg.tsx` é um componente server-side puro.

Ele renderiza somente o que o contrato atual de `MapProjection` fornece:

- routes como polylines;
- nodes conhecidos;
- ghost nodes;
- círculos de incerteza autorizada;
- labels quando presentes na projeção;
- empty state sem inventar conteúdo.

Acessibilidade e comportamento:

- SVG possui `role="img"` e nome acessível;
- `preserveAspectRatio="xMidYMid meet"`;
- known e ghost possuem distinção semântica/visual;
- labels ausentes permanecem ausentes;
- não há hooks, browser APIs, fetch, Supabase browser client ou estado interativo neste corte.

## Composição da home autenticada

A home do player agora troca o placeholder pelo renderer real sem enfraquecer o boundary do 8B.

`loadPlayerHomeMap` produz somente três estados:

- `ready` — projeção com geometria renderizável;
- `empty` — projeção autorizada sem geometria renderizável;
- `unavailable` — falha fechada e sanitizada.

Falhas internas não têm mensagem, stack trace, payload do banco ou detalhe sensível ecoado para a UI.

## Auditoria de atalhos proibidos

A comparação integral do corte 8C contra o head final do 8B (`fd1f11ddf1771b9cc16dca68f2cf109c3b5ac435`) mostra alterações apenas em renderer/composição/CSS, testes e documentação. O corte não alterou `package.json`, config/env de Supabase, migrations nem contratos de projeção existentes além do export do helper de viewport.

A auditoria confirma:

- nenhum `service_role`, `SUPABASE_SERVICE` ou `SUPABASE_SECRET` foi adicionado ao app do player;
- nenhum `createBrowserClient` ou outro Supabase browser client foi adicionado;
- nenhuma leitura/import/query de `world_private` foi adicionada;
- nenhum caminho de identidade controlado pela request foi adicionado;
- o renderer recebe `MapProjection` somente;
- nenhum campo de canonical ID foi adicionado à projeção;
- nenhuma reconstrução da posição canônica de ghost foi adicionada;
- falha de projeção exibida ao usuário permanece sanitizada.

## Evidência do CI funcional

Run `33356141753` (#446), head `4be3b93765f69b6bb7a192ac482789375f2efefa`:

### quality

- format: PASS;
- lint: PASS;
- typecheck: PASS;
- unit tests: PASS — 24 arquivos, 122 testes;
- build: PASS.

### database

- rebuild completo do Supabase local a partir do Git: PASS;
- 53 testes permanentes de banco/RLS: PASS;
- PostgREST leakage smoke: PASS;
- Player Auth projection smoke com sessões A/B reais: PASS;
- tipos gerados do banco sem drift: PASS;
- teardown do Supabase local: PASS.

Mensagens permanentes dos smokes:

`PostgREST leakage smoke passed: player A receives only the safe ghost while player B receives the authorized investigated location.`

`Player Auth projection smoke passed: invite-only Auth is enforced and real A/B sessions remain isolated by player_api RLS.`

## Fora do escopo / próximos cortes da Fase 8

O fechamento do 8C não encerra a Fase 8 inteira. Permanecem para cortes posteriores:

- graus visuais/semânticos de conhecimento de rotas;
- detalhe progressivo de nodes;
- confiança, origem, frescor e privacidade em apresentação onde aplicável;
- notas do jogador;
- compartilhamento controlado de conhecimento;
- interações mobile/touch e eventual pan/zoom após a fundação estática estar consolidada.

PixiJS/WebGPU continuam adiados; qualquer adapter futuro deve consumir o mesmo boundary neutro de `MapProjection`.

## Regra de fechamento

Este documento registra a evidência funcional do head `4be3b93765f69b6bb7a192ac482789375f2efefa`. O Gate 8C só deve ser marcado como **tecnicamente fechado** após o commit documental que contém este checkpoint obter `quality = success` e `database = success` no CI permanente. Depois disso, a PR do corte deve permanecer draft/open e sem merge.
