import { describe, expect, it } from 'vitest';
import * as studioAssets from './studio-assets';

describe('studio asset import', () => {
  it('exposes a preparation function before imported assets can enter the Studio', () => {
    expect('prepareStudioAssetImport' in studioAssets).toBe(true);
  });
});
