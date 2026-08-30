# Player Knowledge V0 progress

Gate 8A implementado na branch `foundation/player-knowledge-v0`.

Este arquivo acompanha a execução do plano canônico em `docs/superpowers/plans/2026-08-30-player-knowledge-core.md`.

- Task 1 — gramática canônica de conhecimento: concluída e revalidada pelo CI permanente.
- Task 2 — ghost nodes com incerteza espacial segura: concluída e revalidada pelo CI permanente.
- Task 3 — builder puro de `MapProjection`: concluída com schema validation, endpoint filtering, ghost radius guard e varredura anti-vazamento.
- Task 4 — prova A/B: concluída em unit tests e smoke PostgREST real.
- Evidência funcional: head `dd30ca428e8c2e257c59af3bdd058869490b3300`, CI run `33294801271`, jobs `quality` e `database` verdes.
- Checkpoint detalhado: `docs/PLAYER_KNOWLEDGE_V0_STATUS.md`.

O head documental final ainda precisa permanecer verde no CI permanente antes de o Gate 8A ser declarado fechado.
