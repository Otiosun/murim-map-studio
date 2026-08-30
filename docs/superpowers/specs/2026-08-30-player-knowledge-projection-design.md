# Player Knowledge Projection 8A — Design

## Status

Design aprovado por continuidade do checklist canônico da Fase 8. Este documento especifica somente o corte **8A — núcleo seguro de projeção e gramática de conhecimento**. Autenticação real, endpoint Next/Supabase, renderer SVG/mobile, notas e compartilhamento ficam em 8B–8D.

## Objetivo

Produzir `MapProjection` a partir de dados explicitamente player-safe, com IDs locais de projeção, estados de conhecimento canônicos e ghost nodes com incerteza espacial, sem permitir que o renderer ou o navegador recebam IDs, geometrias ou payloads canônicos que o jogador não conhece.

## Decisões

### 1. Uma única gramática de conhecimento

A fonte de verdade semântica é `packages/domain/src/entities.ts`:

```text
rumor → indication → localized → confirmed → investigated → understood
```

O banco atualmente usa os aliases legados `clue` e `located`; uma migration da Fase 8A deve convertê-los para `indication` e `localized`, incluindo enum, checks e seeds. Não haverá camada permanente de aliases concorrentes.

### 2. A projeção não conhece a verdade canônica

`@murim/map-renderer` não pode importar tabelas/DTOs de `world_private`. O builder recebe somente DTOs sanitizados com `projectionId`, nunca `source_location_id` ou IDs canônicos.

A fronteira é:

```text
world_private + regras/autorização
        ↓ trusted server/materializer
player-safe DTOs / player_api
        ↓
projection builder
        ↓
MapProjection
        ↓
SVG/React player renderer
```

### 3. IDs locais de projeção são a única identidade visível ao player

Todos os nodes/routes de `MapProjection` usam IDs locais de projeção. Nenhum objeto de projeção contém `canonicalId`, `sourceLocationId`, `worldId` privado ou equivalente.

### 4. Ghost node é conhecimento aproximado, não posição real degradada no cliente

Rumor/indication pode ser representado como `role: 'ghost'` com:

```ts
approximateLocation: {
  center: { x, y },
  radius: number
}
```

O servidor/materializer decide o centro aproximado e raio seguro. O cliente não recebe a geometria verdadeira para então embaralhá-la.

`world_private.player_location_knowledge` ganha `approximate_radius` nullable/positivo. `player_api.map_nodes` ganha campos seguros suficientes para a projeção (`role` e `approximate_radius`) sem expor o vínculo canônico.

### 5. Posição de node

- `known`: `position` é a posição autorizada exposta em `player_api`.
- `ghost`: `position` é o centro aproximado seguro e `approximateLocation` contém o mesmo centro + raio.
- Se um registro não tiver geometria autorizada suficiente para renderização, ele não gera node espacial ainda.

### 6. Rotas

8A preserva a tabela `player_api.map_routes` e cria a conversão segura para `ProjectionRoute` somente quando os dois endpoints player-local existem. `styleKey` deriva do estado de conhecimento; não haverá acesso à rota canônica pelo builder.

Mapeamento V0 sugerido:

```text
rumor        → route-rumor
indication   → route-indication
localized    → route-localized
confirmed    → route-confirmed
investigated → route-investigated
understood   → route-understood
```

### 7. Metadados mínimos

8A mantém `metadata` estritamente player-safe e mínimo. Origem/frescor/privacidade detalhados entram em cortes posteriores. Não duplicar `details` arbitrário inteiro do banco para o renderer sem allow-list.

### 8. Segurança testável

Testes devem provar:

1. Player A e Player B produzem `MapProjection` diferentes para a mesma verdade de mundo.
2. Ghost node contém centro aproximado + raio e não contém geometria canônica.
3. Saída usa somente projection-local IDs.
4. O schema de `MapProjection` rejeita estados de conhecimento fora da gramática canônica.
5. PostgREST/RLS continua impedindo Player A de recuperar nome/ID/geometria verdadeira do segredo.
6. Nenhum objeto do builder possui chaves de identidade canônica allow-listadas como proibidas (`canonicalId`, `sourceLocationId`, `source_location_id`, `worldId`, `world_id`, `secretPayload`, `secret_payload`).

## Arquivos e responsabilidades

- `packages/domain/src/entities.ts` — gramática canônica existente; não duplicar.
- `packages/map-renderer/src/player-projection.ts` — DTOs player-safe + builder puro para `MapProjection`.
- `packages/map-renderer/src/player-projection.test.ts` — comportamento e anti-vazamento estrutural do builder.
- `packages/map-renderer/src/index.ts` — export do builder.
- `supabase/migrations/<timestamp>_player_knowledge_projection_v0.sql` — alinhamento de estados + campos ghost seguros.
- `supabase/seed.sql` — dados determinísticos atualizados para a nova gramática/raio, sem alterações de schema.
- `supabase/tests/database/rls.test.sql` — provas de RLS/colunas player-safe.
- `scripts/database-api-leakage-test.mjs` — smoke real de PostgREST com dois jogadores.
- `supabase/database.types.ts` — regenerado pelo CLI, nunca editado manualmente.

## Fora de escopo 8A

- login/UI de autenticação;
- criação de Supabase client em `apps/player`;
- endpoint Next.js de sessão;
- renderer visual SVG definitivo;
- edição de nota privada;
- compartilhamento de KnowledgeFact;
- economia de informação;
- visual final do mapa;
- persistência de upload de asset.

## Gate 8A

O corte 8A passa quando um teste puro e o banco real provam que dois jogadores recebem projeções semanticamente diferentes usando apenas IDs locais, incluindo pelo menos um ghost node com raio de incerteza, enquanto a verdade canônica continua irrecuperável pelo cliente não autorizado.
