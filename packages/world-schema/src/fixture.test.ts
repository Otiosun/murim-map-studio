import { describe, expect, it } from 'vitest';
import minimalWorld from '../fixtures/minimal-world.v1.json';
import { parseWorldPack } from './index';

describe('canonical JSON fixture', () => {
  it('parses the minimal renderer-independent world pack', () => {
    expect(parseWorldPack(minimalWorld)).toEqual(minimalWorld);
  });
});
