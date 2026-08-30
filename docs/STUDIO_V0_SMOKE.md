# Studio V0 — Smoke obrigatório

O Gate 6 só fecha quando este fluxo estiver comprovado no mesmo documento:

1. abrir o Studio;
2. criar um `Location`;
3. mover o `Location` por drag;
4. editar uma propriedade pelo Inspector;
5. criar outro `Location` e conectar uma `Route`;
6. executar undo;
7. executar redo;
8. salvar;
9. recarregar;
10. confirmar que IDs, posições, propriedades e rota permanecem equivalentes ao estado salvo.

Regras:

- o canvas não é fonte de verdade;
- toda mutação de mundo passa por `Command` do domínio;
- um drag completo gera uma entrada de histórico somente no `dragEnd`;
- save inválido é recusado pelas invariantes do domínio;
- persistência local do primeiro corte usa envelope versionado em `localStorage`;
- persistência remota/autenticação não é requisito deste primeiro corte do Gate 6.
