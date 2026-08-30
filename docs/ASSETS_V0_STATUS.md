# Assets & Templates V0 status

## Fase 7 — EM EXECUÇÃO

Checkpoint integrado após Gate 6 técnico.

### Implementado e validado no workflow de integração

- `AssetManifest` independente do renderer, com ID estável, versão/hash, tipo, mídia, origem, tags, dimensões, anchor/defaultSize e metadados de atribuição/licença.
- Busca por nome/tipo/mídia/tags.
- Import boundary V0 aceita somente SVG/WebP/PNG, valida extensão/MIME/tamanho e marca SVG como exigindo sanitização antes de preview/render.
- Templates/Prefabs geram nova entidade com ID, timestamps e world scope próprios; defaults/overrides não podem escrever chaves protegidas de identidade.
- Migração automática do save legado do Studio (`world-murim-v0`) para UUID canônico, preservando entidades e saves existentes.
- Cinco assets ideográficos SVG intencionais: vila, portão, seita/templo, fonte de Qi e ruína.
- Cinco templates correspondentes para Location.
- Biblioteca visual pesquisável no Studio.
- Biblioteca de modelos pesquisável; escolher modelo e tocar no canvas instancia Location novo, sem vínculo mutável ao template.
- Inspector permite trocar/remover visual por `UpdateProperty`; o teste prova que ID, nome e posição semanticamente permanecem intactos.
- Canvas usa o asset escolhido como apresentação e mantém fallback sem símbolo.
- Lockfile do workspace atualizado por pnpm pinado e validado.

### Evidência

- Integração validada por workflow temporário com format, lint, typecheck, testes e build antes de commit.
- Commit integrado limpo anterior a este checkpoint: `9aa1acdbebde61984c3f0cc9e6807c4571569a42`.
- Workflows/scripts temporários de escrita foram removidos após o commit.
- PR #8 continua draft contra `foundation/studio-v0`; não mergear ainda.

### Gate 7 ainda aberto

Falta completar o fluxo de upload/import com preview seguro, incluindo sanitização real de SVG antes de qualquer render de conteúdo enviado pelo usuário. Depois disso, revalidar CI permanente + preview Vercel e fechar o Gate 7.
