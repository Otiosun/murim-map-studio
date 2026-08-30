'use client';

import type { AssetManifest, TemplateEntity } from '@murim/domain';
import { BUILT_IN_TEMPLATES, searchStudioAssets } from '../lib/studio-assets';

export type StudioLibraryMode = 'assets' | 'templates';

export interface StudioAssetImportDraft {
  fileName: string;
  mediaType: string;
  size: number;
  previewSource: string;
  sanitized: boolean;
}

interface StudioLibraryPanelProps {
  mode: StudioLibraryMode;
  query: string;
  selectedAssetId?: string | undefined;
  importDraft?: StudioAssetImportDraft | undefined;
  importError?: string | undefined;
  onQueryChange: (query: string) => void;
  onSelectAsset: (manifest: AssetManifest) => void;
  onClearAsset: () => void;
  onSelectTemplate: (template: TemplateEntity) => void;
  onImportFile?: (file: File) => void;
  onCancelImport?: () => void;
  onConfirmImport?: () => void;
  onClose: () => void;
}

function matchesTemplate(template: TemplateEntity, query: string): boolean {
  const tokens = query.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [template.name, template.entityType, ...template.tags]
    .join(' ')
    .toLocaleLowerCase('pt-BR');
  return tokens.every((token) => haystack.includes(token));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  const value = Number.isInteger(kib) ? kib.toFixed(0) : kib.toFixed(1);
  return `${value} KiB`;
}

export function StudioLibraryPanel({
  mode,
  query,
  selectedAssetId,
  importDraft,
  importError,
  onQueryChange,
  onSelectAsset,
  onClearAsset,
  onSelectTemplate,
  onImportFile,
  onCancelImport,
  onConfirmImport,
  onClose,
}: StudioLibraryPanelProps) {
  const assets = searchStudioAssets(query);
  const templates = BUILT_IN_TEMPLATES.filter((template) => matchesTemplate(template, query));

  return (
    <section
      className="library-panel"
      aria-label={mode === 'assets' ? 'Biblioteca visual' : 'Modelos'}
    >
      <header className="library-heading">
        <div>
          <span className="eyebrow">{mode === 'assets' ? 'BIBLIOTECA VISUAL' : 'MODELOS'}</span>
          <strong>{mode === 'assets' ? 'Símbolos do mapa' : 'Criar a partir de modelo'}</strong>
        </div>
        <button
          type="button"
          className="library-close"
          onClick={onClose}
          aria-label="Fechar painel"
        >
          ×
        </button>
      </header>

      <div className="library-search">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={mode === 'assets' ? 'Buscar vila, Qi, ruína…' : 'Buscar modelo…'}
        />
      </div>

      {mode === 'assets' ? (
        <>
          <label className="library-import">
            <span>
              <strong>Importar asset</strong>
              <small>SVG, WebP ou PNG · máximo 2 MiB</small>
            </span>
            <input
              type="file"
              accept="image/svg+xml,image/webp,image/png"
              onChange={(event) => {
                const file = event.currentTarget.files?.item(0);
                if (file) onImportFile?.(file);
                event.currentTarget.value = '';
              }}
            />
          </label>

          {importError ? (
            <p className="library-import-error" role="alert">
              {importError}
            </p>
          ) : null}

          {importDraft ? (
            <section className="library-import-preview" aria-label="Preview do asset importado">
              <div className="library-import-preview-main">
                <span className="asset-preview import-preview">
                  <img src={importDraft.previewSource} alt="" />
                </span>
                <span>
                  <strong>{importDraft.fileName}</strong>
                  <small>
                    {formatBytes(importDraft.size)} ·{' '}
                    {importDraft.sanitized ? 'SVG sanitizado' : importDraft.mediaType}
                  </small>
                </span>
              </div>
              <div className="library-import-actions">
                <button type="button" className="button ghost" onClick={onCancelImport}>
                  Cancelar
                </button>
                <button type="button" className="button" onClick={onConfirmImport}>
                  Confirmar importação
                </button>
              </div>
            </section>
          ) : null}

          <div className="library-list">
            <button
              type="button"
              className={!selectedAssetId ? 'library-card selected' : 'library-card'}
              onClick={onClearAsset}
            >
              <span className="asset-preview asset-preview-empty">·</span>
              <span>
                <strong>Sem símbolo</strong>
                <small>Location continua existindo semanticamente.</small>
              </span>
            </button>
            {assets.map((manifest) => (
              <button
                type="button"
                className={
                  selectedAssetId === manifest.assetId ? 'library-card selected' : 'library-card'
                }
                key={manifest.assetId}
                onClick={() => onSelectAsset(manifest)}
              >
                <span className="asset-preview">
                  <img src={manifest.source} alt="" />
                </span>
                <span>
                  <strong>{manifest.name}</strong>
                  <small>{manifest.tags.slice(0, 3).join(' · ')}</small>
                </span>
              </button>
            ))}
            {assets.length === 0 ? (
              <p className="library-empty">Nenhum símbolo encontrado.</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="library-list">
          {templates.map((template) => (
            <button
              type="button"
              className="library-card"
              key={template.id}
              onClick={() => onSelectTemplate(template)}
            >
              <span className="template-preview">＋</span>
              <span>
                <strong>{template.name}</strong>
                <small>{template.tags.slice(0, 3).join(' · ')}</small>
              </span>
            </button>
          ))}
          {templates.length === 0 ? (
            <p className="library-empty">Nenhum modelo encontrado.</p>
          ) : null}
        </div>
      )}

      <footer className="library-footer">
        {mode === 'assets'
          ? 'Visual é apresentação. ID, posição e semântica do Location não mudam.'
          : 'Escolha um modelo e depois toque no canvas para posicionar a nova entidade.'}
      </footer>
    </section>
  );
}
