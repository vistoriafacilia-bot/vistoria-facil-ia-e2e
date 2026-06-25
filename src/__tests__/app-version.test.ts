import { describe, expect, it } from 'vitest';
import { APP_RELEASE_DATE, APP_RELEASE_LABEL, APP_VERSION, APP_VERSION_METADATA } from '../lib/appVersion';

describe('app version metadata', () => {
  it('centraliza versão de release candidate do app', () => {
    expect(APP_VERSION).toBe('V0.4.0-rc2');
    expect(APP_RELEASE_DATE).toBe('2026-06-25');
    expect(APP_RELEASE_LABEL).toContain(APP_VERSION);
    expect(APP_VERSION_METADATA.releaseCandidate).toBe(true);
    expect(APP_VERSION_METADATA.baseline).toContain('Patch025');
  });
});
