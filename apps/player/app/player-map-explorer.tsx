'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatPlayerKnowledgeState,
  getPlayerNodeDisplayName,
  type PlayerNodeDetailView,
} from '../lib/map/player-node-detail-model';

export interface PlayerMapExplorerProps {
  nodes: readonly PlayerNodeDetailView[];
  children: ReactNode;
}

const NODE_SELECTOR = '[data-player-node="true"]';
const PANEL_ID = 'player-node-detail-panel';
const PANEL_TITLE_ID = 'player-node-detail-title';

function findPlayerNodeElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest(NODE_SELECTOR);
}

function focusNodeByAuthorizedId(root: HTMLDivElement | null, id: string): boolean {
  if (!root) {
    return false;
  }

  for (const element of root.querySelectorAll(NODE_SELECTOR)) {
    if (element.getAttribute('data-node-id') !== id) {
      continue;
    }

    const focus = (element as Element & { focus?: () => void }).focus;
    if (typeof focus === 'function') {
      focus.call(element);
      return true;
    }
    return false;
  }

  return false;
}

export function PlayerMapExplorer({ nodes, children }: PlayerMapExplorerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const authorizedNodes = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedNodeId === null ? undefined : authorizedNodes.get(selectedNodeId);

  const selectAuthorizedNode = useCallback(
    (id: string | null) => {
      if (id === null || !authorizedNodes.has(id)) {
        return;
      }
      setSelectedNodeId(id);
    },
    [authorizedNodes],
  );

  const closePanel = useCallback(() => {
    if (selectedNodeId === null) {
      return;
    }

    const idToFocus = selectedNodeId;
    setSelectedNodeId(null);
    if (!focusNodeByAuthorizedId(rootRef.current, idToFocus)) {
      rootRef.current?.focus();
    }
  }, [selectedNodeId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    for (const element of root.querySelectorAll(NODE_SELECTOR)) {
      const id = element.getAttribute('data-node-id');
      const selected =
        id !== null && authorizedNodes.has(id) && selectedNodeId !== null && id === selectedNodeId;
      element.setAttribute('aria-pressed', selected ? 'true' : 'false');
      element.setAttribute('data-node-selected', selected ? 'true' : 'false');
    }
  }, [authorizedNodes, selectedNodeId]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const element = findPlayerNodeElement(event.target);
    if (!element) {
      return;
    }

    selectAuthorizedNode(element.getAttribute('data-node-id'));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      if (selectedNodeId !== null) {
        event.preventDefault();
        closePanel();
      }
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const element = findPlayerNodeElement(event.target);
    if (!element) {
      return;
    }

    if (event.key === ' ') {
      event.preventDefault();
    }
    selectAuthorizedNode(element.getAttribute('data-node-id'));
  }

  return (
    <div
      aria-label="Explorador do mapa do jogador"
      className="player-map-explorer"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      ref={rootRef}
      role="region"
      tabIndex={-1}
    >
      <div className="player-map-explorer-canvas">{children}</div>
      <aside
        aria-labelledby={PANEL_TITLE_ID}
        aria-live="polite"
        className="player-node-detail-panel"
        hidden={selectedNode === undefined}
        id={PANEL_ID}
      >
        {selectedNode ? (
          <>
            <div className="player-node-detail-header">
              <div>
                <p className="player-node-detail-eyebrow">Conhecimento do mapa</p>
                <h2 id={PANEL_TITLE_ID}>{getPlayerNodeDisplayName(selectedNode)}</h2>
              </div>
              <button
                aria-label="Fechar detalhes do local"
                className="player-node-detail-close"
                onClick={closePanel}
                type="button"
              >
                Fechar
              </button>
            </div>

            <div className="player-node-detail-body">
              {selectedNode.role === 'ghost' ? (
                <p className="player-node-detail-approximate">Localização aproximada</p>
              ) : null}
              {selectedNode.detail?.category ? (
                <p className="player-node-detail-category">{selectedNode.detail.category}</p>
              ) : null}
              {selectedNode.knowledgeState ? (
                <p className="player-node-detail-state">
                  {formatPlayerKnowledgeState(selectedNode.knowledgeState)}
                </p>
              ) : null}
              {selectedNode.detail?.summary ? (
                <p className="player-node-detail-summary">{selectedNode.detail.summary}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
