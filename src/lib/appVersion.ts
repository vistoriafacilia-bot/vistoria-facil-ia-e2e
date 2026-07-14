export const APP_VERSION = 'V0.4.0-rc4';
export const APP_RELEASE_DATE = '2026-07-14';
export const APP_RELEASE_LABEL = `${APP_VERSION} (${APP_RELEASE_DATE})`;

export const APP_VERSION_METADATA = {
  version: APP_VERSION,
  releaseDate: APP_RELEASE_DATE,
  label: APP_RELEASE_LABEL,
  releaseCandidate: true,
  baseline: 'Patch027 Payment Success Message Cleanup RC4'
} as const;
