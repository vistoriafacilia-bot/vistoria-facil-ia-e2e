import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}));

const loadMainWithDiagnosticsFlag = async (value?: string) => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
  if (value === undefined) {
    vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', undefined);
  } else {
    vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', value);
  }
  await import('../main');
};

describe('technical diagnostics environment flag', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.onerror = null;
  });

  afterEach(() => {
    document.getElementById('tech-diagnostics-panel')?.remove();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.onerror = null;
  });

  it('renders diagnostics when VITE_DIAGNOSTICS_ENABLED is true', async () => {
    await loadMainWithDiagnosticsFlag('true');

    window.onerror?.(
      'Internal failure debugCode=private_code',
      'https://app.example/internal.js',
      12,
      34,
      new Error('Internal stack frame'),
    );

    const panel = document.getElementById('tech-diagnostics-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Diagn');
    expect(panel).toHaveTextContent('debugCode=private_code');
  });

  it('does not render diagnostics when VITE_DIAGNOSTICS_ENABLED is false', async () => {
    await loadMainWithDiagnosticsFlag('false');

    window.onerror?.(
      'Internal failure debugCode=private_code',
      'https://app.example/internal.js',
      12,
      34,
      new Error('Internal stack frame'),
    );

    expect(document.getElementById('tech-diagnostics-panel')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('debugCode=private_code');
    expect(document.body).not.toHaveTextContent('Internal stack frame');
  });

  it('does not render diagnostics when VITE_DIAGNOSTICS_ENABLED is absent', async () => {
    await loadMainWithDiagnosticsFlag();

    window.onerror?.(
      'Internal failure debugCode=private_code',
      'https://app.example/internal.js',
      12,
      34,
      new Error('Internal stack frame'),
    );

    expect(document.getElementById('tech-diagnostics-panel')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('debugCode=private_code');
    expect(document.body).not.toHaveTextContent('Internal stack frame');
  });
});
