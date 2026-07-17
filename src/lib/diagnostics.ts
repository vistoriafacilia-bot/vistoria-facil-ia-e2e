export const isTechnicalDiagnosticsEnabled = (
  value: string | boolean | undefined = import.meta.env.VITE_DIAGNOSTICS_ENABLED,
) => value === 'true';
