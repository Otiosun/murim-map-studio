# Studio V0 status

## Gate 6 — PASSOU (técnico)

O primeiro Studio funcional está implementado em `foundation/studio-v0`.

Studio V2 inclui:

- React + react-konva sem usar o renderer como fonte de verdade;
- canvas responsivo com pan, wheel zoom e touch pinch-to-zoom preservando o ponto do mundo;
- seleção de Location/Route e drag de Location com `MoveEntity` somente no fim do gesto;
- criação e deleção de Location, conexão de Route e restauração por undo;
- Inspector contextual dirigido por registry compartilhado, gravando propriedades somente por Commands;
- autosave local com debounce e estados `saved` / `saving` / `error` / `conflict`;
- persistência versionada com encode/decode e validação das invariantes do domínio;
- save/reload preservando IDs, posição e propriedades;
- undo/redo com snapshots canônicos exatos; o smoke novo descobriu e corrigiu drift de timestamps no redo;
- recusa de undo/redo quando o documento diverge do snapshot esperado;
- smoke automatizado obrigatório: create → move → edit → connect Route → undo → redo → save → reload → comparação exata do documento canônico.

### Evidência

- Head validado: `085b37aaf8b2d0ececf0f9e74859c165ec911a14`.
- CI permanente #88: `quality` verde — format, lint, typecheck, unit tests e build.
- CI permanente #88: `database` verde — rebuild, RLS, anti-vazamento PostgREST e tipos gerados.
- Preview Vercel V2: deployment `dpl_GFm7jGyBcivm7U1o6gjyUZhXT76u`, estado `READY`.
- O preview está protegido pela configuração de Preview da conta Vercel; acesso externo usa share URL temporária. Não foi feito deploy de produção para contornar essa proteção.

O Gate 6 técnico está fechado. Spot-check manual em browsers/aparelho Android e E2E Playwright continuam pertencendo à Fase 10 de qualidade, sem bloquear a entrada na Fase 7.
