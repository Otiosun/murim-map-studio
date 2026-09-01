# Player Node Details V0 status

Status: **CLOSED — Gate 8E**

Branch: `foundation/player-node-details-v0`

Base canônica: Gate 8D final `65a2ecd6961624210a6a85086eee68c139440a85`.

Head funcional verde: `e4b51807fbb1f023e0a9a8000a28e7a95a93a7f4`.

## Boundary de dados

O detalhe compacto de node continua subordinado à `MapProjection` autorizada. `ProjectionNode` ganhou somente o contrato opcional `detail`, com `category` e `summary` como campos textuais player-safe.

O adapter de `player_api.map_nodes.details` é estrito e fail-closed:

- aceita somente `{}`, `{ category }`, `{ summary }` ou `{ category, summary }`;
- aplica `trim` antes da projeção;
- `category` deve ter entre 1 e 80 caracteres após `trim`;
- `summary` deve ter entre 1 e 600 caracteres após `trim`;
- `{}` normaliza para ausência de `detail`;
- arrays, `null`, tipos incorretos, strings vazias, excesso de tamanho, objetos aninhados e chaves extras fazem a projeção inteira falhar fechada.

Nenhum fluxo copia automaticamente `world_private.locations.payload`, `secret_payload` ou outro payload canônico privado para `player_api.map_nodes.details`. As fixtures públicas do seed materializam detalhes seguros e específicos por jogador explicitamente.

O guard anti-vazamento de `MapProjection` permanece recursivo sobre `detail`, então aliases de IDs canônicos/source/world/owner e payloads secretos continuam rejeitados como defesa em profundidade.

## Minimização no cliente

A home autenticada continua resolvendo a sessão e carregando a projeção no servidor. A ilha cliente recebe somente um view model derivado da projeção já autorizada:

- `id` local da projeção;
- `label?`;
- `role`;
- `knowledgeState?`;
- `detail?`.

Ela não recebe `position`, geometria, raio aproximado, `confidence`, `metadata`, rotas, IDs canônicos/source/world, owner/player ID ou resposta bruta do banco.

Selecionar um node não executa `fetch`, query Supabase, server action, router lookup nem resolução de truth adicional. O estado `selectedNodeId` é apenas efêmero no cliente. IDs ausentes ou injetados no DOM são ignorados e não alteram uma seleção válida.

## Interação e acessibilidade

`PlayerMapSvg` permanece server-rendered e passivo quanto a dados. O SVG usa `role="group"` e cada node autorizado é um alvo focável com `role="button"`, `tabIndex=0`, `aria-pressed` e somente seu ID local de projeção como metadata de interação.

Ativação suportada neste corte:

- click, incluindo o click sintetizado por pointer/touch do navegador;
- `Enter`;
- `Space`, com prevenção do scroll padrão;
- `Escape` para fechar;
- botão explícito `Fechar`.

O painel é não modal. Abrir detalhes não rouba foco. Ao fechar, o foco retorna ao node selecionado se ele ainda existir no DOM; caso contrário, cai para a região do explorer.

Node sem label usa exatamente `Local não identificado`. Ghost pode acrescentar apenas `localização aproximada`. IDs, coordenadas, confiança numérica e nomes inferidos não são usados como fallback textual.

O estado selecionado é refletido em `aria-pressed` e no atributo canônico `data-selected`; `data-node-selected` permanece somente como compatibilidade de apresentação. Hover, `focus-visible` e seleção alteram apenas o marker visual.

## Touch e apresentação

Cada node possui um hit target SVG separado do marker visível, com stroke transparente de aproximadamente 44 CSS px e `vector-effect: non-scaling-stroke`. Esse alvo usa somente o centro já autorizado do node, não participa do cálculo de viewport e não muda geometria ou precisão de conhecimento.

O painel de detalhe é compacto e responsivo, adjacente/abaixo do mapa conforme a largura disponível, sem overlay fixo ou backdrop modal. Ele pode mostrar somente label segura, category, estado de conhecimento em linguagem humana, summary e o aviso genérico de localização aproximada para ghost.

Os estilos de known/ghost, incerteza e os seis graus de rota do 8C/8D permanecem intactos.

## Provas finais do head funcional

CI #536 / run `33456259216` no head `e4b51807fbb1f023e0a9a8000a28e7a95a93a7f4`:

- `quality`: SUCCESS;
- `database`: SUCCESS;
- instalação com lockfile congelado: PASS;
- format, lint e typecheck: PASS;
- 28 test files / 180 testes unitários e de componente: PASS;
- build de produção do workspace: PASS;
- rebuild completo do Supabase a partir de migrations + seed: PASS;
- 4 arquivos / 78 testes DB/RLS: PASS;
- PostgREST A/B: detalhes permanecem específicos por jogador e a precisão das rotas continua autorizada;
- Auth real A/B: detalhes de node e geometria de rota permanecem isolados entre sessões;
- tipos TypeScript gerados do banco: sem drift.

Auditoria líquida contra o head final do 8D:

- 26 paths alterados/adicionados;
- branch `ahead`, `behind_by=0`;
- nenhuma migration nova;
- nenhum workflow de CI alterado;
- nenhum arquivo temporário de tipos gerados;
- dependência de teste nova limitada a `jsdom@30.0.1`.

## Limites deliberados

Este corte não inclui Playwright, validação manual em aparelho real nem matriz completa Chromium/WebKit/Firefox; esses gates permanecem para a fase de qualidade/E2E apropriada.

Também permanecem fora do 8E: confiança/origem/frescor/privacidade em apresentação, notas privadas do jogador, compartilhamento de KnowledgeFact, pan/zoom e detalhes de rota.

## Estado da Fase 8

8A, 8B, 8C, 8D e 8E estão tecnicamente fechados. O Gate 8 completo permanece aberto.

Próximo corte: **confiança, origem, frescor e privacidade em apresentação segura**.

Nenhum merge ou deploy faz parte deste fechamento.
