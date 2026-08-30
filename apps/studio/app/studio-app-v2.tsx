'use client';

import {
  createCommandHistory,
  executeWithHistory,
  redoWithHistory,
  undoWithHistory,
  type AssetManifest,
  type CommandHistory,
  type CommandMetadata,
  type CommandPayload,
  type EntityId,
  type LocationEntity,
  type RouteEntity,
  type TemplateEntity,
  type WorldDocument,
  type WorldEntity,
} from '@murim/domain';
import { instantiateTemplateEntity } from '@murim/world-schema';
import Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { StudioAssetVisual } from './studio-asset-visual';
import { StudioLibraryPanel, type StudioLibraryMode } from './studio-library-panel';
import {
  STUDIO_STORAGE_KEY,
  createInitialWorldDocument,
  decodeStudioDocument,
  encodeStudioDocument,
  inspectorFieldsFor,
  inspectorStringValue,
} from '../lib/studio-model';
import { assetManifestForId } from '../lib/studio-assets';

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 720;
const GRID_SIZE = 48;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.4;

type Tool = 'select' | 'pan' | 'location' | 'route' | 'template';
type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

interface ViewportState {
  width: number;
  height: number;
}

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

interface PinchState {
  distance: number;
  scale: number;
  worldPoint: { x: number; y: number };
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeMetadata(): CommandMetadata {
  const id = crypto.randomUUID();
  return {
    commandId: id,
    issuedAt: nowIso(),
    source: 'studio',
    actor: { kind: 'user', ref: 'local-adm' },
    correlationId: id,
  };
}

function entityLabel(entity: WorldEntity): string {
  if ('name' in entity && typeof entity.name === 'string') return entity.name;
  if (entity.type === 'route') return `Rota · ${entity.routeKind}`;
  return entity.type;
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case 'saved':
      return 'Salvo';
    case 'saving':
      return 'Salvando…';
    case 'error':
      return 'Erro ao salvar';
    case 'conflict':
      return 'Conflito';
  }
}

function flattenRoute(route: RouteEntity): number[] {
  return route.path.points.flatMap((point) => [point.x, point.y]);
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function StudioAppV2() {
  const [worldDocument, setWorldDocument] = useState<WorldDocument>(() =>
    createInitialWorldDocument(),
  );
  const [history, setHistory] = useState<CommandHistory>(() => createCommandHistory());
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [routeStartId, setRouteStartId] = useState<EntityId | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [libraryMode, setLibraryMode] = useState<StudioLibraryMode | null>(null);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [pendingTemplate, setPendingTemplate] = useState<TemplateEntity | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('Clique em “Local” e depois no canvas para começar.');
  const [viewport, setViewport] = useState<ViewportState>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });

  const stageRef = useRef<Konva.Stage | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const lastSavedJsonRef = useRef('');
  const pinchRef = useRef<PinchState | null>(null);

  const locations = useMemo(
    () =>
      worldDocument.entities.filter(
        (entity): entity is LocationEntity => entity.type === 'location',
      ),
    [worldDocument],
  );
  const routes = useMemo(
    () => worldDocument.entities.filter((entity): entity is RouteEntity => entity.type === 'route'),
    [worldDocument],
  );
  const selectedEntity = useMemo(
    () => worldDocument.entities.find((entity) => entity.id === selectedId) ?? null,
    [selectedId, worldDocument],
  );
  const inspectorFields = useMemo(
    () => (selectedEntity ? inspectorFieldsFor(selectedEntity) : []),
    [selectedEntity],
  );
  const selectedAssetManifest = useMemo(
    () =>
      selectedEntity?.type === 'location' ? assetManifestForId(selectedEntity.assetId) : undefined,
    [selectedEntity],
  );

  const persist = useCallback((documentToSave: WorldDocument) => {
    try {
      setSaveStatus('saving');
      const encoded = encodeStudioDocument(documentToSave);
      window.localStorage.setItem(STUDIO_STORAGE_KEY, encoded);
      lastSavedJsonRef.current = JSON.stringify(documentToSave);
      setSaveStatus('saved');
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialDocument = worldDocument;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const raw = window.localStorage.getItem(STUDIO_STORAGE_KEY);
      if (!raw) {
        lastSavedJsonRef.current = JSON.stringify(initialDocument);
        setHydrated(true);
        return;
      }

      const decoded = decodeStudioDocument(raw);
      if (!decoded.ok) {
        setSaveStatus('error');
        setMessage(`Save local recusado: ${decoded.reason}`);
        setHydrated(true);
        return;
      }

      setWorldDocument(decoded.envelope.document);
      lastSavedJsonRef.current = JSON.stringify(decoded.envelope.document);
      setMessage('Documento local restaurado com IDs e posições preservados.');
      setHydrated(true);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Hydration from browser persistence intentionally happens once after the first client commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (JSON.stringify(worldDocument) === lastSavedJsonRef.current) return;

    const timer = window.setTimeout(() => {
      persist(worldDocument);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [hydrated, persist, worldDocument]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(420, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STUDIO_STORAGE_KEY || !event.newValue) return;
      if (JSON.stringify(worldDocument) !== lastSavedJsonRef.current) {
        setSaveStatus('conflict');
        setMessage('Outro contexto alterou o save local enquanto este documento tinha mudanças.');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [worldDocument]);

  const applyPayload = useCallback(
    (payload: CommandPayload): boolean => {
      const result = executeWithHistory(worldDocument, history, {
        meta: makeMetadata(),
        payload,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return false;
      }

      setWorldDocument(result.document);
      setHistory(result.history);
      setSaveStatus('saving');
      setMessage(`${payload.kind} aplicado · ${result.auditEvent.eventKind}`);
      return true;
    },
    [history, worldDocument],
  );

  const undo = useCallback(() => {
    const result = undoWithHistory(worldDocument, history, makeMetadata());
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setWorldDocument(result.document);
    setHistory(result.history);
    setSelectedId(null);
    setRouteStartId(null);
    setSaveStatus('saving');
    setMessage('Undo aplicado sobre o documento canônico.');
  }, [history, worldDocument]);

  const redo = useCallback(() => {
    const result = redoWithHistory(worldDocument, history, makeMetadata());
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setWorldDocument(result.document);
    setHistory(result.history);
    setSelectedId(null);
    setRouteStartId(null);
    setSaveStatus('saving');
    setMessage('Redo aplicado sobre o documento canônico.');
  }, [history, worldDocument]);

  const createLocation = useCallback(
    (x: number, y: number) => {
      const timestamp = nowIso();
      const entity: LocationEntity = {
        id: crypto.randomUUID(),
        type: 'location',
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        worldId: worldDocument.rootWorldId,
        name: `Local ${locations.length + 1}`,
        locationKind: 'place',
        position: { x: Math.round(x), y: Math.round(y) },
        tags: [],
      };
      if (applyPayload({ kind: 'CreateEntity', entity })) {
        setSelectedId(entity.id);
        setTool('select');
      }
    },
    [applyPayload, locations.length, worldDocument.rootWorldId],
  );

  const createFromTemplate = useCallback(
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
          setMessage(
            `${template.name} criado com ID próprio. O modelo não mantém vínculo mutável.`,
          );
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

  const selectLocationForRoute = useCallback(
    (locationId: EntityId) => {
      if (!routeStartId) {
        setRouteStartId(locationId);
        setSelectedId(locationId);
        setMessage('Primeiro ponto da rota definido. Toque em outro local.');
        return;
      }
      if (routeStartId === locationId) {
        setMessage('A rota precisa terminar em outro local.');
        return;
      }

      if (
        applyPayload({
          kind: 'ConnectRoute',
          routeId: crypto.randomUUID(),
          fromLocationId: routeStartId,
          toLocationId: locationId,
          routeKind: 'path',
          bidirectional: true,
          tags: [],
        })
      ) {
        setRouteStartId(null);
        setTool('select');
        setSelectedId(locationId);
      }
    },
    [applyPayload, routeStartId],
  );

  const updateSelectedProperty = useCallback(
    (property: string, value: string) => {
      if (!selectedEntity) return;
      const current = inspectorStringValue(selectedEntity, property);
      if (current === value) return;
      applyPayload({
        kind: 'UpdateProperty',
        entityId: selectedEntity.id,
        property,
        mutation: { operation: 'set', value },
      });
    },
    [applyPayload, selectedEntity],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedEntity || selectedEntity.type === 'world') return;
    if (applyPayload({ kind: 'DeleteEntity', entityId: selectedEntity.id })) {
      setSelectedId(null);
      setRouteStartId(null);
    }
  }, [applyPayload, selectedEntity]);

  const reloadSaved = useCallback(() => {
    const raw = window.localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) {
      setMessage('Ainda não existe save local para recarregar.');
      return;
    }
    const decoded = decodeStudioDocument(raw);
    if (!decoded.ok) {
      setSaveStatus('error');
      setMessage(`Reload recusado: ${decoded.reason}`);
      return;
    }

    setWorldDocument(decoded.envelope.document);
    setHistory(createCommandHistory());
    setSelectedId(null);
    setRouteStartId(null);
    lastSavedJsonRef.current = JSON.stringify(decoded.envelope.document);
    setSaveStatus('saved');
    setMessage('Reload concluído. IDs, posições e propriedades vieram do save.');
  }, []);

  const gridLines = useMemo(() => {
    const worldWidth = viewport.width / Math.max(view.scale, 0.01);
    const worldHeight = viewport.height / Math.max(view.scale, 0.01);
    const minX = -view.x / view.scale - GRID_SIZE * 2;
    const minY = -view.y / view.scale - GRID_SIZE * 2;
    const maxX = minX + worldWidth + GRID_SIZE * 4;
    const maxY = minY + worldHeight + GRID_SIZE * 4;
    const lines: { key: string; points: number[] }[] = [];

    for (let x = Math.floor(minX / GRID_SIZE) * GRID_SIZE; x <= maxX; x += GRID_SIZE) {
      lines.push({ key: `v-${x}`, points: [x, minY, x, maxY] });
    }
    for (let y = Math.floor(minY / GRID_SIZE) * GRID_SIZE; y <= maxY; y += GRID_SIZE) {
      lines.push({ key: `h-${y}`, points: [minX, y, maxX, y] });
    }
    return lines;
  }, [view, viewport]);

  const createAtPointer = useCallback(() => {
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

  const handlePinch = useCallback(
    (event: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = event.evt.touches;
      if (touches.length !== 2) return;
      event.evt.preventDefault();

      const first = touches.item(0);
      const second = touches.item(1);
      const stage = stageRef.current;
      if (!first || !second || !stage) return;
      stage.stopDrag();

      const rect = stage.container().getBoundingClientRect();
      const center = {
        x: (first.clientX + second.clientX) / 2 - rect.left,
        y: (first.clientY + second.clientY) / 2 - rect.top,
      };
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      if (!Number.isFinite(distance) || distance <= 0) return;

      const currentPinch = pinchRef.current;
      if (!currentPinch) {
        pinchRef.current = {
          distance,
          scale: view.scale,
          worldPoint: {
            x: (center.x - view.x) / view.scale,
            y: (center.y - view.y) / view.scale,
          },
        };
        return;
      }

      const nextScale = clampScale(currentPinch.scale * (distance / currentPinch.distance));
      setView({
        scale: nextScale,
        x: center.x - currentPinch.worldPoint.x * nextScale,
        y: center.y - currentPinch.worldPoint.y * nextScale,
      });
    },
    [view],
  );

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">MURIM MAP STUDIO · FOUNDATION V0</span>
          <h1>World Editor</h1>
        </div>
        <div className="topbar-actions">
          <span className={`save-state save-${saveStatus}`}>
            <span className="status-dot" />
            {saveStatusLabel(saveStatus)}
          </span>
          <button type="button" className="button ghost" onClick={() => persist(worldDocument)}>
            Salvar
          </button>
          <button type="button" className="button ghost" onClick={reloadSaved}>
            Recarregar
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="toolrail" aria-label="Ferramentas do mapa">
          <button
            type="button"
            className={tool === 'select' ? 'tool active' : 'tool'}
            onClick={() => {
              setTool('select');
              setRouteStartId(null);
            }}
          >
            <span className="tool-key">V</span>
            Selecionar
          </button>
          <button
            type="button"
            className={tool === 'pan' ? 'tool active' : 'tool'}
            onClick={() => {
              setTool('pan');
              setRouteStartId(null);
            }}
          >
            <span className="tool-key">H</span>
            Mover visão
          </button>
          <button
            type="button"
            className={tool === 'location' ? 'tool active' : 'tool'}
            onClick={() => {
              setTool('location');
              setRouteStartId(null);
              setMessage('Clique ou toque no canvas para criar um Location.');
            }}
          >
            <span className="tool-key">L</span>
            Local
          </button>
          <button
            type="button"
            className={tool === 'route' ? 'tool active' : 'tool'}
            onClick={() => {
              setTool('route');
              setRouteStartId(null);
              setMessage('Escolha dois Locations para conectar uma Route.');
            }}
          >
            <span className="tool-key">R</span>
            Rota
          </button>
          <button
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
          <div className="tool-divider" />
          <button
            type="button"
            className="tool"
            disabled={history.past.length === 0}
            onClick={undo}
          >
            <span className="tool-key">↶</span>
            Undo
          </button>
          <button
            type="button"
            className="tool"
            disabled={history.future.length === 0}
            onClick={redo}
          >
            <span className="tool-key">↷</span>
            Redo
          </button>
        </aside>

        <div className="canvas-column">
          <div className="canvas-status">
            <span>{message}</span>
            <span className="canvas-metrics">
              {locations.length} locais · {routes.length} rotas · {Math.round(view.scale * 100)}%
            </span>
          </div>

          {libraryMode ? (
            <StudioLibraryPanel
              mode={libraryMode}
              query={libraryQuery}
              selectedAssetId={
                selectedEntity?.type === 'location' ? selectedEntity.assetId : undefined
              }
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

          <div ref={canvasShellRef} className={`canvas-shell cursor-${tool}`}>
            <Stage
              ref={stageRef}
              width={viewport.width}
              height={viewport.height}
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale}
              draggable={tool === 'pan'}
              onDragEnd={(event) => {
                if (event.target !== event.target.getStage()) return;
                setView((current) => ({
                  ...current,
                  x: event.target.x(),
                  y: event.target.y(),
                }));
              }}
              onWheel={(event) => {
                event.evt.preventDefault();
                const stage = stageRef.current;
                if (!stage) return;
                const pointer = stage.getPointerPosition();
                if (!pointer) return;

                const oldScale = view.scale;
                const nextScale = clampScale(oldScale * (event.evt.deltaY > 0 ? 1 / 1.08 : 1.08));
                const worldPoint = {
                  x: (pointer.x - view.x) / oldScale,
                  y: (pointer.y - view.y) / oldScale,
                };
                setView({
                  scale: nextScale,
                  x: pointer.x - worldPoint.x * nextScale,
                  y: pointer.y - worldPoint.y * nextScale,
                });
              }}
              onTouchMove={handlePinch}
              onTouchEnd={(event) => {
                if (event.evt.touches.length < 2) pinchRef.current = null;
              }}
              onClick={(event) => {
                if (event.target !== event.target.getStage()) return;
                if (tool === 'select') {
                  setSelectedId(null);
                  return;
                }
                createAtPointer();
              }}
              onTap={(event) => {
                if (event.target !== event.target.getStage()) return;
                if (tool === 'select') {
                  setSelectedId(null);
                  return;
                }
                createAtPointer();
              }}
            >
              <Layer listening={false}>
                <Rect x={-5000} y={-5000} width={10000} height={10000} fill="#0c0d0d" />
                {gridLines.map((line) => (
                  <Line
                    key={line.key}
                    points={line.points}
                    stroke="#1d2120"
                    strokeWidth={1 / view.scale}
                  />
                ))}
                <Line points={[-5000, 0, 5000, 0]} stroke="#303532" strokeWidth={1 / view.scale} />
                <Line points={[0, -5000, 0, 5000]} stroke="#303532" strokeWidth={1 / view.scale} />
              </Layer>

              <Layer>
                {routes.map((route) => {
                  const selected = selectedId === route.id;
                  return (
                    <Line
                      key={route.id}
                      points={flattenRoute(route)}
                      stroke={selected ? '#e8c66a' : '#65706a'}
                      strokeWidth={(selected ? 4 : 2) / view.scale}
                      hitStrokeWidth={18 / view.scale}
                      lineCap="round"
                      lineJoin="round"
                      onClick={(event) => {
                        event.cancelBubble = true;
                        if (tool === 'select') setSelectedId(route.id);
                      }}
                      onTap={(event) => {
                        event.cancelBubble = true;
                        if (tool === 'select') setSelectedId(route.id);
                      }}
                    />
                  );
                })}

                {locations.map((location) => {
                  const selected = selectedId === location.id;
                  const routeOrigin = routeStartId === location.id;
                  return (
                    <Group
                      key={location.id}
                      x={location.position.x}
                      y={location.position.y}
                      draggable={tool === 'select'}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        if (tool === 'route') selectLocationForRoute(location.id);
                        else setSelectedId(location.id);
                      }}
                      onTap={(event) => {
                        event.cancelBubble = true;
                        if (tool === 'route') selectLocationForRoute(location.id);
                        else setSelectedId(location.id);
                      }}
                      onDragEnd={(event) => {
                        applyPayload({
                          kind: 'MoveEntity',
                          entityId: location.id,
                          position: {
                            x: Math.round(event.target.x()),
                            y: Math.round(event.target.y()),
                          },
                        });
                      }}
                    >
                      <StudioAssetVisual
                        assetId={location.assetId}
                        scale={view.scale}
                        highlighted={selected || routeOrigin}
                      />
                      <Text
                        text={location.name}
                        x={28 / view.scale}
                        y={-8 / view.scale}
                        fontSize={13 / view.scale}
                        fill={selected ? '#f3f0e8' : '#aeb6b2'}
                        listening={false}
                      />
                    </Group>
                  );
                })}
              </Layer>

              <Layer listening={false}>
                {selectedEntity && 'position' in selectedEntity ? (
                  <Circle
                    x={selectedEntity.position.x}
                    y={selectedEntity.position.y}
                    radius={22 / view.scale}
                    stroke="#e8c66a"
                    strokeWidth={1 / view.scale}
                    dash={[5 / view.scale, 5 / view.scale]}
                  />
                ) : null}
              </Layer>
            </Stage>
          </div>
        </div>

        <aside className="inspector">
          <div className="panel-heading">
            <span className="eyebrow">INSPECTOR</span>
            <strong>{selectedEntity ? entityLabel(selectedEntity) : 'Nada selecionado'}</strong>
          </div>

          {selectedEntity ? (
            <div className="inspector-body">
              <div className="entity-badge">{selectedEntity.type}</div>
              <label className="field">
                <span>ID</span>
                <input value={selectedEntity.id} readOnly />
              </label>

              {inspectorFields.map((field) => {
                const current = inspectorStringValue(selectedEntity, field.property);
                return (
                  <label className="field" key={`${selectedEntity.type}-${field.property}`}>
                    <span>{field.label}</span>
                    <input
                      key={`${selectedEntity.id}-${field.property}-${current}`}
                      defaultValue={current}
                      onBlur={(event) =>
                        updateSelectedProperty(
                          field.property,
                          event.currentTarget.value.trim() || field.fallback || current,
                        )
                      }
                    />
                  </label>
                );
              })}

              {selectedEntity.type === 'location' ? (
                <div className="coordinate-grid">
                  <div>
                    <span>X</span>
                    <strong>{Math.round(selectedEntity.position.x)}</strong>
                  </div>
                  <div>
                    <span>Y</span>
                    <strong>{Math.round(selectedEntity.position.y)}</strong>
                  </div>
                </div>
              ) : null}

              {selectedEntity.type === 'route' ? (
                <dl className="route-summary">
                  <div>
                    <dt>Origem</dt>
                    <dd>{selectedEntity.fromLocationId.slice(0, 8)}</dd>
                  </div>
                  <div>
                    <dt>Destino</dt>
                    <dd>{selectedEntity.toLocationId.slice(0, 8)}</dd>
                  </div>
                </dl>
              ) : null}

              {selectedEntity.type === 'location' ? (
                <div className="visual-control">
                  <span className="eyebrow">VISUAL</span>
                  <div className="visual-control-row">
                    <span className="asset-preview compact">
                      {selectedAssetManifest ? (
                        <img src={selectedAssetManifest.source} alt="" />
                      ) : (
                        '·'
                      )}
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

              {selectedEntity.type !== 'world' ? (
                <button type="button" className="button danger" onClick={deleteSelected}>
                  Apagar entidade
                </button>
              ) : null}
            </div>
          ) : (
            <div className="empty-inspector">
              <p>Selecione um Location ou Route para editar propriedades.</p>
              <p>O Inspector usa o registry de schema do Studio e grava somente por Commands.</p>
            </div>
          )}

          <div className="history-card">
            <span className="eyebrow">HISTÓRICO</span>
            <strong>{history.past.length} ações commitadas</strong>
            <span>{history.future.length} disponíveis para redo</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
