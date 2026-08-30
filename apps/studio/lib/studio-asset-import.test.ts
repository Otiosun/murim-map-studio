import { describe, expect, it } from 'vitest';
import * as studioAssetImport from './studio-asset-import';

describe('studio asset import', () => {
  it('exposes a preparation function before imported assets can enter the Studio', () => {
    expect('prepareStudioAssetImport' in studioAssetImport).toBe(true);
  });
});
