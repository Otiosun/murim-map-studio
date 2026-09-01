import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

describe('player map interaction presentation', () => {
  it('keeps a touch-sized non-scaling hit target separate from the visible marker', () => {
    expect(css).toContain('.player-node-hit-target');
    expect(css).toContain('stroke-width: 44px');
    expect(css).toContain('pointer-events: stroke');
    expect(css).toContain('vector-effect: non-scaling-stroke');
  });

  it('styles hover, focus-visible, and the canonical selected state', () => {
    expect(css).toContain(
      ".player-map-svg [data-player-node='true']:hover [data-node-marker='true']",
    );
    expect(css).toContain(
      ".player-map-svg [data-player-node='true']:focus-visible [data-node-marker='true']",
    );
    expect(css).toContain(
      ".player-map-svg [data-player-node='true'][data-selected='true'] [data-node-marker='true']",
    );
  });
});
