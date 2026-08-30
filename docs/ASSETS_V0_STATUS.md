# Assets & Templates V0 status

## Fase 7 — PASSOU TECNICAMENTE

Checkpoint integrado após Gate 6 técnico. A Fase 7 está tecnicamente fechada; a publicação do preview atualizado ficou pendente exclusivamente por quota externa da Vercel Hobby, não por falha de código.

### Implementado

- `AssetManifest` independente do renderer, com ID estável, versão/hash, tipo, mídia, origem, tags, dimensões, anchor/defaultSize e metadados de atribuição/licença.
- Busca por nome/tipo/mídia/tags.
- Asset é apresentação: Location continua semanticamente válido sem símbolo e a troca de asset não altera ID, nome ou posição.
- Cinco assets ideográficos SVG intencionais: vila, portão, seita/templo, fonte de Qi e ruína.
- Cinco templates correspondentes para Location.
- Biblioteca visual pesquisável no Studio.
- Biblioteca de modelos pesquisável; escolher modelo e tocar no canvas instancia Location novo com identidade própria, sem vínculo mutável ao template.
- Templates/Prefabs não podem sobrescrever ID, timestamps ou world scope por defaults/overrides.
- Migração automática do save legado do Studio (`world-murim-v0`) para UUID canônico, preservando entidades e saves existentes.
- Import boundary aceita somente SVG/WebP/PNG e usa um único limite canônico de 2 MiB compartilhado entre `world-schema` e Studio.
- SVG nunca entra cru no preview: DOMPurify `3.4.14` é chamado com perfil SVG/SVG Filters; conteúdo vazio após sanitização é rejeitado.
- PNG/WebP são preparados apenas como Data URL local de preview.
- Selecionar arquivo cria somente um draft local; não executa Command nem altera `WorldDocument`.
- Preview mostra arquivo/tamanho/estado de sanitização e pode ser cancelado.
- `Confirmar importação` permanece explicitamente desabilitado enquanto não houver persistência confiável configurada; Gate 7 não introduz upload browser-side nem Data URL canônica.
- Bucket privado `map-assets` nasce por migration com limite de 2 MiB e whitelist SVG/WebP/PNG; não existe política de escrita direta para browser.
- Configuração do bucket pertence exclusivamente à migration; o seed não reconfigura schema/storage.
- Canvas usa o asset escolhido como apresentação e mantém fallback sem símbolo.
- Lockfile do workspace atualizado por pnpm pinado e validado.

### Evidência final

- Testes cobrem AssetManifest, busca, validação de MIME/extensão/tamanho, sanitização SVG, preview raster, template com identidade nova e troca de visual preservando identidade semântica.
- O RED do bucket demonstrou a regressão do seed para 25 MiB; a causa foi corrigida na fonte removendo configuração de schema/storage do seed.
- CI permanente #222 passou integralmente em `quality` e `database` no head `c821f292794faf556190f1d75406b885e02d4a0e`: format, lint, typecheck, testes, build, rebuild de banco, pgTAP/RLS, smoke PostgREST e verificação de tipos gerados.
- PR #8 continua draft contra `foundation/studio-v0`; não mergear ainda.

### Preview Vercel

- O preview V2 anterior continua disponível.
- Uma tentativa de publicar o head final da Fase 7 foi bloqueada pela quota `api-deployments-free-per-day` do plano Hobby (100/100). Nenhum código precisa ser alterado por causa disso.
- Assim que a quota resetar, publicar um preview a partir do SHA final da Fase 7 e fazer smoke HTTP/visual antes de promover qualquer endereço como atual.

### Gate 7

Critério canônico: criar um local semanticamente correto, trocar seu asset sem mudar sua identidade e reutilizar templates sem duplicar lógica manual.

**Status: PASSOU TECNICAMENTE.**
