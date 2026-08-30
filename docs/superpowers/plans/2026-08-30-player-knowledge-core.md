# Player Knowledge Core 8A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar a gramática de conhecimento e produzir `MapProjection` segura, player-local e capaz de representar ghost nodes com incerteza espacial sem vazar verdade canônica.

**Architecture:** O banco continua separando `world_private` de `player_api`. A materialização/autorização produz dados player-safe e o novo builder puro em `@murim/map-renderer` converte somente esses DTOs para `MapProjection`; ele nunca recebe entidades canônicas. O corte 8A não cria autenticação nem UI final.

**Tech Stack:** TypeScript 6, Vitest 4, Zod 4, Supabase/PostgreSQL/PostGIS, pgTAP, PostgREST.

**Spec:** `docs/superpowers/specs/2026-08-30-player-knowledge-projection-design.md`

## Global Constraints

- Conhecimento canônico: `rumor`, `indication`, `localized`, `confirmed`, `investigated`, `understood`.
- Nenhum ID canônico ou `world_private` pode entrar em `MapProjection`.
- Ghost uncertainty é produzida no lado confiável; o navegador nunca recebe a posição verdadeira para degradá-la localmente.
- IDs de `MapProjection` são projection-local IDs.
- `supabase/database.types.ts` é regenerado pelo Supabase CLI; nunca editado à mão.
- Toda alteração de banco nasce em migration versionada; seed contém somente dados determinísticos.
- CI continua exigindo format, lint, typecheck, unit tests, build, db reset, pgTAP/RLS, PostgREST leakage smoke e database type drift check.

---

### Task 1: Unificar a gramática de conhecimento no banco

**Files:**
- Create: `supabase/migrations/20260830034000_player_knowledge_states_v0.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Generated: `supabase/database.types.ts`

**Interfaces:**
- Consumes: `KNOWLEDGE_STATES` de `@murim/domain` como semântica canônica.
- Produces: banco com `rumor | indication | localized | confirmed | investigated | understood` em `world_private.player_location_knowledge.state`, `player_api.map_nodes.knowledge_state` e `player_api.map_routes.knowledge_state`.

- [ ] **Step 1: Escrever RED no pgTAP para a gramática canônica**

Adicionar ao teste uma asserção que leia os valores aceitos/armazenados e prove que seed nenhum contém `clue` ou `located`, enquanto `indication` e `localized` são válidos.

- [ ] **Step 2: Rodar banco e confirmar RED**

Run: `pnpm db:start && pnpm db:reset && pnpm db:test`

Expected: FAIL especificamente porque o schema/seed ainda usa `clue`/`located`.

- [ ] **Step 3: Criar migration mínima de rename/alinhamento**

A migration deve:

```sql
alter type world_private.knowledge_state rename value 'clue' to 'indication';
alter type world_private.knowledge_state rename value 'located' to 'localized';
```

Recriar os CHECKs player-facing para aceitar exatamente:

```text
rumor, indication, localized, confirmed, investigated, understood
```

- [ ] **Step 4: Atualizar seed apenas nos valores de dados**

Trocar qualquer valor legado `clue`/`located`; não criar schema/configuração no seed.

- [ ] **Step 5: Regenerar tipos com o CLI pinado**

Run: `pnpm db:types > supabase/database.types.ts`

- [ ] **Step 6: Rodar verificação completa da tarefa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm db:test`

Expected: todos verdes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260830034000_player_knowledge_states_v0.sql supabase/seed.sql supabase/tests/database/rls.test.sql supabase/database.types.ts
git commit -m "feat: align player knowledge states"
```

---

### Task 2: Representar ghost nodes com incerteza espacial segura

**Files:**
- Create: `supabase/migrations/20260830035000_player_ghost_projection_v0.sql`
- Modify: `supabase/seed.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `scripts/database-api-leakage-test.mjs`
- Generated: `supabase/database.types.ts`

**Interfaces:**
- Consumes: estados canônicos da Task 1.
- Produces: `player_api.map_nodes` com `role` (`known|ghost`) e `approximate_radius`; `world_private.player_location_knowledge` com `approximate_radius` nullable/positivo.

- [ ] **Step 1: Escrever RED para o rumor de Player A**

O pgTAP deve exigir que o rumor player-facing tenha:

```text
role = ghost
approximate_radius > 0
```

O node investigado de Player B deve ter `role = known`.

- [ ] **Step 2: Reforçar RED no smoke PostgREST**

Em `database-api-leakage-test.mjs`, exigir que Player A receba o ghost com raio positivo e continue sem receber `source_location_id`, canonical IDs, nome secreto ou geometria verdadeira `(900,900)`.

- [ ] **Step 3: Rodar e confirmar RED**

Run: `pnpm db:start && pnpm db:reset && pnpm db:test && node scripts/database-api-leakage-test.mjs`

Expected: FAIL porque `role`/`approximate_radius` ainda não existem.

- [ ] **Step 4: Criar migration mínima**

Adicionar:

```sql
alter table world_private.player_location_knowledge
  add column approximate_radius double precision
  check (approximate_radius is null or approximate_radius > 0);

alter table player_api.map_nodes
  add column role text not null default 'known'
  check (role in ('known', 'ghost')),
  add column approximate_radius double precision
  check (approximate_radius is null or approximate_radius > 0);
```

- [ ] **Step 5: Atualizar seed**

Player A secret rumor: `role = 'ghost'`, centro aproximado já existente `(820,860)`, raio determinístico positivo (V0: `180`). Player B investigated secret: `role = 'known'`, sem raio.

- [ ] **Step 6: Regenerar tipos e verificar tudo**

Run: `pnpm db:types > supabase/database.types.ts`

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm db:test && node scripts/database-api-leakage-test.mjs`

Expected: todos verdes, e o smoke continua provando ausência de verdade privada.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260830035000_player_ghost_projection_v0.sql supabase/seed.sql supabase/tests/database/rls.test.sql scripts/database-api-leakage-test.mjs supabase/database.types.ts
git commit -m "feat: add safe ghost projection uncertainty"
```

---

### Task 3: Criar builder puro de `MapProjection`

**Files:**
- Create: `packages/map-renderer/src/player-projection.ts`
- Create: `packages/map-renderer/src/player-projection.test.ts`
- Modify: `packages/map-renderer/src/index.ts`

**Interfaces:**
- Consumes:

```ts
export interface PlayerProjectionNodeInput {
  projectionId: string;
  kind: string;
  label: string;
  knowledgeState: KnowledgeState;
  confidence: number;
  role: 'known' | 'ghost';
  position: WorldPoint;
  approximateRadius?: number;
}

export interface PlayerProjectionRouteInput {
  projectionId: string;
  fromProjectionId: string;
  toProjectionId: string;
  label?: string;
  knowledgeState: KnowledgeState;
  path: PolylineGeometry;
}
```

- Produces:

```ts
export function buildPlayerMapProjection(input: {
  mapKey: string;
  generatedAt: string;
  nodes: readonly PlayerProjectionNodeInput[];
  routes: readonly PlayerProjectionRouteInput[];
}): MapProjection
```

- [ ] **Step 1: Escrever RED para known + ghost**

Teste deve exigir:
- node known com projection-local ID;
- ghost com `role: 'ghost'` e `approximateLocation.center/radius`;
- `symbolKey` derivado de `kind` sem acesso a asset/world entity;
- nenhum campo proibido na saída.

- [ ] **Step 2: Escrever RED para rota**

Rota só é emitida quando `fromProjectionId` e `toProjectionId` existem nos nodes de entrada; `styleKey` deriva do `knowledgeState`.

- [ ] **Step 3: Rodar Vitest e confirmar RED**

Run: `pnpm vitest run packages/map-renderer/src/player-projection.test.ts`

Expected: FAIL porque builder ainda não existe.

- [ ] **Step 4: Implementar builder mínimo**

Regras:
- nunca aceitar world/canonical IDs na interface;
- filtrar rota com endpoints ausentes;
- `known`: sem `approximateLocation`;
- `ghost`: `approximateRadius` obrigatório e positivo; lançar erro se ausente/inválido;
- metadata V0: `{}`;
- `symbolKey = "location:" + kind`;
- `styleKey = "route:" + knowledgeState`.

- [ ] **Step 5: Validar saída com `mapProjectionSchema` nos testes**

Cada fixture produzida deve passar `mapProjectionSchema.parse(result)`.

- [ ] **Step 6: Adicionar varredura anti-vazamento recursiva**

Teste deve falhar se qualquer chave da saída normalizada for uma das seguintes:

```ts
[
  'canonicalId',
  'sourceLocationId',
  'source_location_id',
  'worldId',
  'world_id',
  'secretPayload',
  'secret_payload',
]
```

- [ ] **Step 7: Rodar qualidade completa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: todos verdes.

- [ ] **Step 8: Commit**

```bash
git add packages/map-renderer/src/player-projection.ts packages/map-renderer/src/player-projection.test.ts packages/map-renderer/src/index.ts
git commit -m "feat: build safe player map projections"
```

---

### Task 4: Provar duas perspectivas sem vazamento e fechar 8A

**Files:**
- Modify: `packages/map-renderer/src/player-projection.test.ts`
- Modify: `scripts/database-api-leakage-test.mjs`
- Create: `docs/PLAYER_KNOWLEDGE_V0_STATUS.md`

**Interfaces:**
- Consumes: banco player-safe das Tasks 1–2 e builder da Task 3.
- Produces: evidência do Gate 8A e checkpoint para 8B.

- [ ] **Step 1: Escrever RED de duas perspectivas**

Usar a mesma situação conceitual:
- Player A: vila confirmada + segredo como rumor ghost aproximado;
- Player B: vila confirmada + segredo investigado known.

Exigir que as duas `MapProjection` sejam diferentes e que somente Player B contenha o label autorizado do local secreto.

- [ ] **Step 2: Rodar RED e confirmar causa correta**

Run: `pnpm vitest run packages/map-renderer/src/player-projection.test.ts`

Expected: FAIL até fixture/conversão suportar as duas perspectivas conforme contrato.

- [ ] **Step 3: Fazer GREEN mínimo e executar suite inteira**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Run: `pnpm db:start && pnpm db:reset && pnpm db:test && node scripts/database-api-leakage-test.mjs && pnpm db:stop`

Expected: tudo verde.

- [ ] **Step 4: Registrar checkpoint 8A**

`docs/PLAYER_KNOWLEDGE_V0_STATUS.md` deve registrar:
- gramática única;
- ghost uncertainty server-safe;
- projection-local IDs;
- builder puro;
- prova A/B;
- nenhuma autenticação/UI final ainda;
- hashes/runs finais de CI.

- [ ] **Step 5: Commit**

```bash
git add packages/map-renderer/src/player-projection.test.ts scripts/database-api-leakage-test.mjs docs/PLAYER_KNOWLEDGE_V0_STATUS.md
git commit -m "docs: record Player Knowledge 8A evidence"
```

- [ ] **Step 6: CI permanente**

Aguardar e inspecionar os jobs `quality` e `database`. Não marcar 8A como passou enquanto qualquer etapa estiver pendente ou vermelha.
