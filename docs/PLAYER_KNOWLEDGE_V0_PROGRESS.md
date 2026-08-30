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

Implementação e prova funcional concluídas na branch `foundation/player-auth-v0`.

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
- 110/110 testes unitários verdes.
- tipos gerados do banco permanecem atuais.

Evidência funcional do 8B:

- head: `e79f195d959d49432af30dc5d63398963ece7567`;
- CI run: `33342017902` (#416);
- job `quality`: SUCCESS;
- job `database`: SUCCESS.

Checkpoint detalhado: `docs/PLAYER_AUTH_V0_STATUS.md`.

O 8B está **implementation-complete**. O fechamento técnico definitivo depende somente de o commit documental deste checkpoint permanecer verde no CI permanente; depois disso a PR #10 deve receber a evidência final, continuar draft e permanecer sem merge.
