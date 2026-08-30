from pathlib import Path

path = Path('apps/studio/app/studio-app-v2.tsx')
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'Missing expected Studio source fragment: {old[:90]!r}')
    text = text.replace(old, new, 1)


replace_once(
    "  type CommandHistory,\n",
    "  type AssetManifest,\n  type CommandHistory,\n",
)
replace_once(
    "  type RouteEntity,\n",
    "  type RouteEntity,\n  type TemplateEntity,\n",
)
replace_once(
    "} from '@murim/domain';\n",
    "} from '@murim/domain';\nimport { instantiateTemplateEntity } from '@murim/world-schema';\n",
)
replace_once(
    "import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';\n",
    "import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';\nimport { StudioAssetVisual } from './studio-asset-visual';\nimport { StudioLibraryPanel, type StudioLibraryMode } from './studio-library-panel';\n",
)
replace_once(
    "} from '../lib/studio-model';\n",
    "} from '../lib/studio-model';\nimport { assetManifestForId } from '../lib/studio-assets';\n",
)
replace_once(
    "type Tool = 'select' | 'pan' | 'location' | 'route';",
    "type Tool = 'select' | 'pan' | 'location' | 'route' | 'template';",
)
replace_once(
    "  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');\n",
    "  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');\n"
    "  const [libraryMode, setLibraryMode] = useState<StudioLibraryMode | null>(null);\n"
    "  const [libraryQuery, setLibraryQuery] = useState('');\n"
    "  const [pendingTemplate, setPendingTemplate] = useState<TemplateEntity | null>(null);\n",
)
replace_once(
    "  const inspectorFields = useMemo(\n"
    "    () => (selectedEntity ? inspectorFieldsFor(selectedEntity) : []),\n"
    "    [selectedEntity],\n"
    "  );\n",
    "  const inspectorFields = useMemo(\n"
    "    () => (selectedEntity ? inspectorFieldsFor(selectedEntity) : []),\n"
    "    [selectedEntity],\n"
    "  );\n"
    "  const selectedAssetManifest = useMemo(\n"
    "    () =>\n"
    "      selectedEntity?.type === 'location'\n"
    "        ? assetManifestForId(selectedEntity.assetId)\n"
    "        : undefined,\n"
    "    [selectedEntity],\n"
    "  );\n",
)

handlers = '''  const createFromTemplate = useCallback(
    (template: TemplateEntity, x: number, y: number) => {
      const timestamp = nowIso();
      try {
        const entity = instantiateTemplateEntity(template, {
          id: crypto.randomUUID(),
          worldId: worldDocument.rootWorldId,
          createdAt: timestamp,
          overrides: {
            position: { x: Math.round(x), y: Math.round(y) },
          },
        });

        if (entity.type !== 'location') {
          setMessage(`O modelo ${template.name} ainda não possui renderer de criação nesta fase.`);
          return;
        }

        if (applyPayload({ kind: 'CreateEntity', entity })) {
          setSelectedId(entity.id);
          setPendingTemplate(null);
          setTool('select');
          setMessage(`${template.name} criado com ID próprio. O modelo não mantém vínculo mutável.`);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao instanciar modelo.');
      }
    },
    [applyPayload, worldDocument.rootWorldId],
  );

  const assignAsset = useCallback(
    (manifest: AssetManifest) => {
      if (!selectedEntity || selectedEntity.type !== 'location') {
        setMessage('Selecione um Location antes de escolher um visual.');
        return;
      }
      if (
        applyPayload({
          kind: 'UpdateProperty',
          entityId: selectedEntity.id,
          property: 'assetId',
          mutation: { operation: 'set', value: manifest.assetId },
        })
      ) {
        setMessage(`Visual “${manifest.name}” aplicado sem alterar a identidade do Location.`);
      }
    },
    [applyPayload, selectedEntity],
  );

  const clearAsset = useCallback(() => {
    if (!selectedEntity || selectedEntity.type !== 'location' || !selectedEntity.assetId) return;
    if (
      applyPayload({
        kind: 'UpdateProperty',
        entityId: selectedEntity.id,
        property: 'assetId',
        mutation: { operation: 'unset' },
      })
    ) {
      setMessage('Visual removido. O Location semântico permanece intacto.');
    }
  }, [applyPayload, selectedEntity]);

'''
replace_once("  const selectLocationForRoute = useCallback(\n", handlers + "  const selectLocationForRoute = useCallback(\n")

old_create_pointer = '''  const createAtPointer = useCallback(() => {
    if (tool !== 'location') return;
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const transform = stage.getAbsoluteTransform().copy().invert();
    const point = transform.point(pointer);
    createLocation(point.x, point.y);
  }, [createLocation, tool]);
'''
new_create_pointer = '''  const createAtPointer = useCallback(() => {
    if (tool !== 'location' && tool !== 'template') return;
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const transform = stage.getAbsoluteTransform().copy().invert();
    const point = transform.point(pointer);

    if (tool === 'template' && pendingTemplate) {
      createFromTemplate(pendingTemplate, point.x, point.y);
      return;
    }
    createLocation(point.x, point.y);
  }, [createFromTemplate, createLocation, pendingTemplate, tool]);
'''
replace_once(old_create_pointer, new_create_pointer)

toolbar = '''          <button
            type="button"
            className={libraryMode === 'assets' ? 'tool active' : 'tool'}
            disabled={selectedEntity?.type !== 'location'}
            onClick={() => {
              setLibraryMode((current) => (current === 'assets' ? null : 'assets'));
              setLibraryQuery('');
            }}
          >
            <span className="tool-key">A</span>
            Visuais
          </button>
          <button
            type="button"
            className={libraryMode === 'templates' ? 'tool active' : 'tool'}
            onClick={() => {
              setLibraryMode((current) => (current === 'templates' ? null : 'templates'));
              setLibraryQuery('');
              setRouteStartId(null);
            }}
          >
            <span className="tool-key">T</span>
            Modelos
          </button>
'''
replace_once('          <div className="tool-divider" />\n', toolbar + '          <div className="tool-divider" />\n')

panel = '''          {libraryMode ? (
            <StudioLibraryPanel
              mode={libraryMode}
              query={libraryQuery}
              selectedAssetId={selectedEntity?.type === 'location' ? selectedEntity.assetId : undefined}
              onQueryChange={setLibraryQuery}
              onSelectAsset={assignAsset}
              onClearAsset={clearAsset}
              onSelectTemplate={(template) => {
                setPendingTemplate(template);
                setTool('template');
                setLibraryMode(null);
                setSelectedId(null);
                setRouteStartId(null);
                setMessage(`Modelo “${template.name}” armado. Toque no canvas para posicionar.`);
              }}
              onClose={() => setLibraryMode(null)}
            />
          ) : null}

'''
replace_once(
    '          <div ref={canvasShellRef} className={`canvas-shell cursor-${tool}`}>\n',
    panel + '          <div ref={canvasShellRef} className={`canvas-shell cursor-${tool}`}>\n',
)

old_symbol = '''                      <Circle
                        radius={(selected || routeOrigin ? 14 : 11) / view.scale}
                        fill={routeOrigin ? '#e8c66a' : selected ? '#d9dfda' : '#9ca7a1'}
                        stroke="#0c0d0d"
                        strokeWidth={3 / view.scale}
                      />
                      <Circle radius={4 / view.scale} fill="#0c0d0d" listening={false} />
'''
new_symbol = '''                      <StudioAssetVisual
                        assetId={location.assetId}
                        scale={view.scale}
                        highlighted={selected || routeOrigin}
                      />
'''
replace_once(old_symbol, new_symbol)
replace_once('                        x={18 / view.scale}\n', '                        x={28 / view.scale}\n')

visual_control = '''              {selectedEntity.type === 'location' ? (
                <div className="visual-control">
                  <span className="eyebrow">VISUAL</span>
                  <div className="visual-control-row">
                    <span className="asset-preview compact">
                      {selectedAssetManifest ? <img src={selectedAssetManifest.source} alt="" /> : '·'}
                    </span>
                    <div>
                      <strong>{selectedAssetManifest?.name ?? 'Sem símbolo'}</strong>
                      <small>ID semântico não depende do visual.</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button library-trigger"
                    onClick={() => {
                      setLibraryMode('assets');
                      setLibraryQuery('');
                    }}
                  >
                    Escolher visual
                  </button>
                </div>
              ) : null}

'''
replace_once("              {selectedEntity.type !== 'world' ? (\n", visual_control + "              {selectedEntity.type !== 'world' ? (\n")

path.write_text(text)

css_path = Path('apps/studio/app/globals.css')
css = css_path.read_text()
if '.library-panel {' in css:
    raise SystemExit('Library CSS already present unexpectedly.')
css = css.replace(
    '.canvas-column {\n  min-width: 0;',
    '.canvas-column {\n  position: relative;\n  min-width: 0;',
    1,
)
css = css.replace(
    '.cursor-location canvas,\n.cursor-route canvas {',
    '.cursor-location canvas,\n.cursor-route canvas,\n.cursor-template canvas {',
    1,
)
css += '''

.library-panel {
  position: absolute;
  z-index: 10;
  top: 50px;
  left: 12px;
  width: min(330px, calc(100% - 24px));
  max-height: calc(100% - 64px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid #343936;
  border-radius: 10px;
  background: rgb(17 19 18 / 97%);
  box-shadow: 0 18px 60px rgb(0 0 0 / 42%);
  backdrop-filter: blur(12px);
}

.library-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 14px 11px;
  border-bottom: 1px solid #292d2a;
}

.library-heading strong {
  display: block;
  margin-top: 5px;
  font-size: 0.9rem;
}

.library-close {
  width: 30px;
  height: 30px;
  border: 1px solid #303532;
  border-radius: 7px;
  background: #0d0f0e;
  color: #9ca49f;
  cursor: pointer;
}

.library-search {
  padding: 10px 12px;
  border-bottom: 1px solid #242725;
}

.library-search input {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #303532;
  border-radius: 7px;
  outline: none;
  background: #0d0f0e;
  color: #e0e5e1;
}

.library-search input:focus {
  border-color: #746741;
  box-shadow: 0 0 0 2px rgb(116 103 65 / 18%);
}

.library-list {
  display: grid;
  align-content: start;
  gap: 7px;
  overflow-y: auto;
  padding: 10px;
}

.library-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid #292d2a;
  border-radius: 8px;
  background: #0e100f;
  color: #c8cfca;
  text-align: left;
  cursor: pointer;
}

.library-card:hover,
.library-card.selected {
  border-color: #665a36;
  background: #201d16;
}

.library-card strong,
.visual-control-row strong {
  display: block;
  font-size: 0.8rem;
}

.library-card small,
.visual-control-row small {
  display: block;
  margin-top: 3px;
  color: #737c77;
  font-size: 0.67rem;
  line-height: 1.35;
}

.asset-preview,
.template-preview {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid #2d322f;
  border-radius: 7px;
  background: #0a0c0b;
  color: #b8aa79;
  font-size: 1.2rem;
}

.asset-preview img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.asset-preview-empty {
  color: #626a65;
}

.asset-preview.compact {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
}

.asset-preview.compact img {
  width: 29px;
  height: 29px;
}

.library-empty {
  margin: 10px;
  color: #747c77;
  font-size: 0.76rem;
}

.library-footer {
  padding: 10px 12px;
  border-top: 1px solid #292d2a;
  color: #747c77;
  font-size: 0.68rem;
  line-height: 1.45;
}

.visual-control {
  display: grid;
  gap: 9px;
  padding: 10px;
  border: 1px solid #292d2a;
  border-radius: 8px;
  background: #0d0f0e;
}

.visual-control-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.library-trigger {
  width: 100%;
  font-size: 0.74rem;
}

@media (max-width: 620px) {
  .library-panel {
    top: 72px;
    left: 8px;
    width: calc(100% - 16px);
    max-height: calc(100% - 82px);
  }
}
'''
css_path.write_text(css)
