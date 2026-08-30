'use client';

import {
  createCommandHistory,
  executeWithHistory,
  redoWithHistory,
  undoWithHistory,
  validateWorldDocument,
  type CommandHistory,
  type CommandMetadata,
  type CommandPayload,
  type EntityId,
  type LocationEntity,
  type RouteEntity,
  type WorldDocument,
  type WorldEntity,
} from '@murim/domain';
import Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';

const STORAGE_KEY = 'murim-map-studio:world-document:v1';
const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 720;
const GRID_SIZE = 48;

type Tool = 'select' | 'pan' | 'location' | 'route';
type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

interface StoredDocument {
  schemaVersion: 1;
  savedAt: string;
  document: WorldDocument;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createInitialDocument(): WorldDocument {
  const timestamp = nowIso();
  const worldId = 'world-murim-v0';
  return {
    schemaVersion: 1,
    rootWorldId: worldId,
    entities: [
      {
        id: worldId,
        type: 'world',
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        name: 'Círculo Exterior — Rascunho',
        coordinateSystem: {
          kind: 'planar',
          unit: 'world-unit',
          origin: { x: 0, y: 0 },
        },
      },
    ],
  };
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

function isStoredDocument(value: unknown): value is StoredDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.savedAt !== 'string') return false;
  if (!record.document || typeof record.document !== 'object') return false;

  const candidate = record.document as WorldDocument;
  return candidate.schemaVersion === 1 && validateWorldDocument(candidate).length === 0;
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

export function StudioApp() {
  const [worldDocument, setWorldDocument] = useState<WorldDocument>(() => createInitialDocument());
  const [history, setHistory] = useState<CommandHistory>(() => createCommandHistory());
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [routeStartId, setRouteStartId] = useState<EntityId | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('Clique em “Local” e depois no canvas para começar.');
  const [viewport, setViewport] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  const stageRef = useRef<Konva.Stage | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const lastSavedJsonRef = useRef('');

  const locations = useMemo(
    () => worldDocument.entities.filter((entity): entity is LocationEntity => entity.type === 'location'),
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

  const persist = useCallback((documentToSave: WorldDocument) => {
    try {
      setSaveStatus('saving');
      const envelope: StoredDocument = {
        schemaVersion: 1,
        savedAt: nowIso(),
        document: documentToSave,
      };
      const encoded = JSON.stringify(envelope);
      window.localStorage.setItem(STORAGE_KEY, encoded);
      lastSavedJsonRef.current = JSON.stringify(documentToSave);
      setSaveStatus('saved');
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStoredDocument(parsed)) {
          setWorldDocument(parsed.document);
          lastSavedJsonRef.current = JSON.stringify(parsed.document);
          setMessage('Documento local restaurado com IDs e posições preservados.');
        } else {
          setSaveStatus('error');
          setMessage('O save local foi recusado porque não passa nas invariantes do domínio.');
        }
      } else {
        lastSavedJsonRef.current = JSON.stringify(worldDocument);
      }
    } catch {
      setSaveStatus('error');
      setMessage('Não foi possível ler o save local. O documento em memória foi preservado.');
    } finally {
      setHydrated(true);
    }
    // We intentionally hydrate once from local persistence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const encoded = JSON.stringify(worldDocument);
    if (encoded === lastSavedJsonRef.current) return;

    setSaveStatus('saving');
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
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(420, Math.floor(entry.contentRect.height));
      setViewport({ width, height });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
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

      const created = applyPayload({
        kind: 'ConnectRoute',
        routeId: crypto.randomUUID(),
        fromLocationId: routeStartId,
        toLocationId: locationId,
        routeKind: 'path',
        bidirectional: true,
        tags: [],
      });
      if (created) {
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
      const current = (selectedEntity as unknown as Record<string, unknown>)[property];
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
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setMessage('Ainda não existe save local para recarregar.');
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredDocument(parsed)) {
        setSaveStatus('error');
        setMessage('Reload recusado: o documento salvo não passa nas invariantes.');
        return;
      }
      setWorldDocument(parsed.document);
      setHistory(createCommandHistory());
      setSelectedId(null);
      setRouteStartId(null);
      lastSavedJsonRef.current = JSON.stringify(parsed.document);
      setSaveStatus('saved');
      setMessage('Reload concluído. IDs, posições e propriedades vieram do save.');
    } catch {
      setSaveStatus('error');
      setMessage('Falha ao recarregar o documento local.');
    }
  }, []);

  const gridLines = useMemo(() => {
    const halfWidth = viewport.width / Math.max(view.scale, 0.01);
    const halfHeight = viewport.height / Math.max(view.scale, 0.01);
    const minX = -view.x / view.scale - GRID_SIZE * 2;
    const minY = -view.y / view.scale - GRID_SIZE * 2;
    const maxX = minX + halfWidth + GRID_SIZE * 4;
    const maxY = minY + halfHeight + GRID_SIZE * 4;
    const lines: { key: string; points: number[] }[] = [];

    for (let x = Math.floor(minX / GRID_SIZE) * GRID_SIZE; x <= maxX; x += GRID_SIZE) {
      lines.push({ key: `v-${x}`, points: [x, minY, x, maxY] });
    }
    for (let y = Math.floor(minY / GRID_SIZE) * GRID_SIZE; y <= maxY; y += GRID_SIZE) {
      lines.push({ key: `h-${y}`, points: [minX, y, maxX, y] });
    }
    return lines;
  }, [view, viewport]);

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
              setMessage('Clique no canvas para criar um Location.');
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

          <div className="tool-divider" />

          <button type="button" className="tool" disabled={history.past.length === 0} onClick={undo}>
            <span className="tool-key">↶</span>
            Undo
          </button>
          <button type="button" className="tool" disabled={history.future.length === 0} onClick={redo}>
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
                const direction = event.evt.deltaY > 0 ? -1 : 1;
                const nextScale = Math.min(2.4, Math.max(0.35, oldScale * (direction > 0 ? 1.08 : 1 / 1.08)));
                const mousePoint = {
                  x: (pointer.x - view.x) / oldScale,
                  y: (pointer.y - view.y) / oldScale,
                };
                setView({
                  scale: nextScale,
                  x: pointer.x - mousePoint.x * nextScale,
                  y: pointer.y - mousePoint.y * nextScale,
                });
              }}
              onClick={(event) => {
                if (event.target !== event.target.getStage()) {
                  return;
                }
                if (tool === 'select') {
                  setSelectedId(null);
                  return;
                }
                if (tool !== 'location') return;

                const stage = stageRef.current;
                const pointer = stage?.getPointerPosition();
                if (!stage || !pointer) return;
                const transform = stage.getAbsoluteTransform().copy().invert();
                const point = transform.point(pointer);
                createLocation(point.x, point.y);
              }}
              onTap={(event) => {
                if (event.target !== event.target.getStage() || tool !== 'location') return;
                const stage = stageRef.current;
                const pointer = stage?.getPointerPosition();
                if (!stage || !pointer) return;
                const transform = stage.getAbsoluteTransform().copy().invert();
                const point = transform.point(pointer);
                createLocation(point.x, point.y);
              }}
            >
              <Layer listening={false}>
                <Rect x={-5000} y={-5000} width={10000} height={10000} fill="#0c0d0d" />
                {gridLines.map((line) => (
                  <Line key={line.key} points={line.points} stroke="#1d2120" strokeWidth={1 / view.scale} />
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
                        if (tool === 'route') {
                          selectLocationForRoute(location.id);
                        } else {
                          setSelectedId(location.id);
                        }
                      }}
                      onTap={(event) => {
                        event.cancelBubble = true;
                        if (tool === 'route') {
                          selectLocationForRoute(location.id);
                        } else {
                          setSelectedId(location.id);
                        }
                      }}
                      onDragEnd={(event) => {
                        const point = { x: Math.round(event.target.x()), y: Math.round(event.target.y()) };
                        applyPayload({ kind: 'MoveEntity', entityId: location.id, position: point });
                      }}
                    >
                      <Circle
                        radius={(selected || routeOrigin ? 14 : 11) / view.scale}
                        fill={routeOrigin ? '#e8c66a' : selected ? '#d9dfda' : '#9ca7a1'}
                        stroke="#0c0d0d"
                        strokeWidth={3 / view.scale}
                      />
                      <Circle
                        radius={4 / view.scale}
                        fill="#0c0d0d"
                        listening={false}
                      />
                      <Text
                        text={location.name}
                        x={18 / view.scale}
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

              {selectedEntity.type === 'location' ? (
                <>
                  <label className="field">
                    <span>Nome</span>
                    <input
                      key={`${selectedEntity.id}-name-${selectedEntity.name}`}
                      defaultValue={selectedEntity.name}
                      onBlur={(event) => updateSelectedProperty('name', event.currentTarget.value.trim() || selectedEntity.name)}
                    />
                  </label>
                  <label className="field">
                    <span>Tipo</span>
                    <input
                      key={`${selectedEntity.id}-kind-${selectedEntity.locationKind}`}
                      defaultValue={selectedEntity.locationKind}
                      onBlur={(event) =>
                        updateSelectedProperty('locationKind', event.currentTarget.value.trim() || selectedEntity.locationKind)
                      }
                    />
                  </label>
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
                </>
              ) : null}

              {selectedEntity.type === 'route' ? (
                <>
                  <label className="field">
                    <span>Tipo da rota</span>
                    <input
                      key={`${selectedEntity.id}-route-kind-${selectedEntity.routeKind}`}
                      defaultValue={selectedEntity.routeKind}
                      onBlur={(event) =>
                        updateSelectedProperty('routeKind', event.currentTarget.value.trim() || selectedEntity.routeKind)
                      }
                    />
                  </label>
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
                </>
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
              <p>O canvas é só uma projeção: todas as mudanças passam por Commands do domínio.</p>
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
