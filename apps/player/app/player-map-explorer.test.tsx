// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerNodeDetailView } from '../lib/map/player-node-detail-model';
import { PlayerMapExplorer } from './player-map-explorer';

const nodes: PlayerNodeDetailView[] = [
  {
    id: 'node:known',
    label: 'Vila Qinghe',
    role: 'known',
    knowledgeState: 'confirmed',
    detail: {
      category: 'Vila',
      summary: 'Ponto de chegada e mercado conhecido pelo personagem.',
    },
  },
  {
    id: 'node:ghost',
    role: 'ghost',
    knowledgeState: 'rumor',
  },
];

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousActEnvironment = reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;

function MapMarkup() {
  return (
    <svg aria-label="Mapa de conhecimento do jogador" role="group">
      <g
        aria-controls="player-node-detail-panel"
        aria-label="Vila Qinghe"
        aria-pressed="false"
        data-node-id="node:known"
        data-player-node="true"
        data-selected="false"
        role="button"
        tabIndex={0}
      >
        <circle cx="10" cy="20" r="2" />
      </g>
      <g
        aria-controls="player-node-detail-panel"
        aria-label="Local não identificado, localização aproximada"
        aria-pressed="false"
        data-node-id="node:ghost"
        data-player-node="true"
        data-selected="false"
        role="button"
        tabIndex={0}
      >
        <circle cx="40" cy="50" r="2" />
      </g>
    </svg>
  );
}

function dispatchClick(target: Element) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function dispatchKey(target: Element, key: string) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
  target.dispatchEvent(event);
  return event;
}

describe('PlayerMapExplorer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    if (previousActEnvironment === undefined) {
      delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
      return;
    }
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    act(() => {
      root.render(
        <PlayerMapExplorer nodes={nodes}>
          <MapMarkup />
        </PlayerMapExplorer>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function node(id: string) {
    const element = container.querySelector(`[data-node-id="${id}"]`);
    if (!element) {
      throw new Error(`Missing test node ${id}`);
    }
    return element;
  }

  function panel() {
    const element = container.querySelector<HTMLElement>('#player-node-detail-panel');
    if (!element) {
      throw new Error('Missing player node detail panel');
    }
    return element;
  }

  function explorer() {
    const element = container.querySelector<HTMLElement>('.player-map-explorer');
    if (!element) {
      throw new Error('Missing player map explorer');
    }
    return element;
  }

  it('selects an authorized node by click and renders only safe detail fields', () => {
    act(() => dispatchClick(node('node:known')));

    expect(panel().hidden).toBe(false);
    expect(panel().textContent).toContain('Vila Qinghe');
    expect(panel().textContent).toContain('Vila');
    expect(panel().textContent).toContain('Confirmado');
    expect(panel().textContent).toContain('Ponto de chegada e mercado conhecido pelo personagem.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('supports Enter and Space activation without navigation or network calls', () => {
    act(() => dispatchKey(node('node:known'), 'Enter'));
    expect(panel().textContent).toContain('Vila Qinghe');

    let space!: KeyboardEvent;
    act(() => {
      space = dispatchKey(node('node:ghost'), ' ');
    });

    expect(space.defaultPrevented).toBe(true);
    expect(panel().textContent).toContain('Local não identificado');
    expect(panel().textContent).toContain('Rumor');
    expect(panel().textContent).toContain('Localização aproximada');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('updates the same panel and canonical selected-state semantics when another node is chosen', () => {
    act(() => dispatchClick(node('node:known')));
    expect(node('node:known').getAttribute('aria-pressed')).toBe('true');
    expect(node('node:known').getAttribute('data-selected')).toBe('true');
    expect(node('node:known').getAttribute('data-node-selected')).toBe('true');

    act(() => dispatchClick(node('node:ghost')));

    expect(panel().textContent).toContain('Local não identificado');
    expect(node('node:known').getAttribute('aria-pressed')).toBe('false');
    expect(node('node:known').getAttribute('data-selected')).toBe('false');
    expect(node('node:known').getAttribute('data-node-selected')).toBe('false');
    expect(node('node:ghost').getAttribute('aria-pressed')).toBe('true');
    expect(node('node:ghost').getAttribute('data-selected')).toBe('true');
    expect(node('node:ghost').getAttribute('data-node-selected')).toBe('true');
  });

  it('keeps the panel open when the selected node is activated again', () => {
    act(() => dispatchClick(node('node:known')));
    act(() => dispatchClick(node('node:known')));

    expect(panel().hidden).toBe(false);
    expect(panel().textContent).toContain('Vila Qinghe');
  });

  it('closes with the close button and restores focus to the selected node', () => {
    const known = node('node:known');
    act(() => dispatchClick(known));

    const close = panel().querySelector<HTMLButtonElement>('button');
    if (!close) {
      throw new Error('Missing close button');
    }

    act(() => close.click());

    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(known);
    expect(known.getAttribute('aria-pressed')).toBe('false');
    expect(known.getAttribute('data-selected')).toBe('false');
  });

  it('falls back focus to the explorer region if the selected node leaves the DOM', () => {
    const known = node('node:known');
    act(() => dispatchClick(known));

    known.remove();
    const close = panel().querySelector<HTMLButtonElement>('button');
    if (!close) {
      throw new Error('Missing close button');
    }
    close.focus();

    act(() => close.click());

    expect(panel().hidden).toBe(true);
    expect(explorer().getAttribute('role')).toBe('region');
    expect(explorer().tabIndex).toBe(-1);
    expect(document.activeElement).toBe(explorer());
  });

  it('closes with Escape from either a map node or the panel', () => {
    const known = node('node:known');
    act(() => dispatchKey(known, 'Enter'));
    act(() => dispatchKey(known, 'Escape'));
    expect(panel().hidden).toBe(true);

    act(() => dispatchClick(known));
    const close = panel().querySelector<HTMLButtonElement>('button');
    if (!close) {
      throw new Error('Missing close button');
    }
    close.focus();
    act(() => dispatchKey(close, 'Escape'));

    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(known);
  });

  it('ignores an injected DOM node id that is not present in the authorized view model', () => {
    act(() => dispatchClick(node('node:known')));

    const intruder = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    intruder.setAttribute('data-player-node', 'true');
    intruder.setAttribute('data-node-id', 'node:intruder');
    container.querySelector('svg')?.append(intruder);

    act(() => dispatchClick(intruder));

    expect(panel().textContent).toContain('Vila Qinghe');
    expect(panel().textContent).not.toContain('node:intruder');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not expose geometry or hidden projection data through its client view model content', () => {
    act(() => dispatchClick(node('node:ghost')));

    const text = panel().textContent ?? '';
    expect(text).not.toContain('40');
    expect(text).not.toContain('50');
    expect(text).not.toContain('radius');
    expect(text).not.toContain('confidence');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
