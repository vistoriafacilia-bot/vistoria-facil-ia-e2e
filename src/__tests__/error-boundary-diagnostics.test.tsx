import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../components/ErrorBoundary';

const ThrowInternalError = () => {
  throw new Error('Internal support detail debugCode=private_code');
};

describe('ErrorBoundary diagnostics flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps the public error page generic when diagnostics are disabled', () => {
    vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', 'false');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowInternalError />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: /Algo.*deu certo/ })).toBeInTheDocument();
    expect(screen.queryByText('Detalhes do erro para suporte')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('debugCode=private_code');
  });

  it('keeps the public error page generic when diagnostics are absent', () => {
    vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowInternalError />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: /Algo.*deu certo/ })).toBeInTheDocument();
    expect(screen.queryByText('Detalhes do erro para suporte')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('debugCode=private_code');
  });

  it('shows support details only when diagnostics are enabled', () => {
    vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', 'true');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowInternalError />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Detalhes do erro para suporte')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('debugCode=private_code');
  });
});
