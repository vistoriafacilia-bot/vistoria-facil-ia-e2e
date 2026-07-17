import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  currentUser: null as any,
  signedInUser: {
    uid: 'admin-session-user',
    email: 'admin@example.com',
    displayName: 'Admin Session',
  },
  listener: undefined as undefined | ((user: any) => void),
}));

const authService = vi.hoisted(() => ({
  loginWithEmailPassword: vi.fn(async () => {
    authState.listener?.(authState.signedInUser);
    return authState.signedInUser;
  }),
  loginWithGoogle: vi.fn(),
  onAuthStateChanged: vi.fn((callback: (user: any) => void) => {
    authState.listener = callback;
    callback(authState.currentUser);
    return () => {
      authState.listener = undefined;
    };
  }),
  resetPasswordForEmail: vi.fn(),
  signUpWithEmailPassword: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock('../lib/services/authService', () => authService);

vi.mock('../components/admin/AdminApp', () => ({
  default: () => <div data-testid="admin-app">Admin route loaded</div>,
}));

import App from '../App';

describe('Admin access routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = null;
    authState.listener = undefined;
    window.history.replaceState({}, '', '/admin');
  });

  it('shows the normal login screen when /admin has no session', async () => {
    render(<App />);

    expect(await screen.findByTestId('public-email-auth-form')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-app')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin');
  });

  it('shows the public login screen without a session', async () => {
    window.history.replaceState({}, '', '/');

    render(<App />);

    expect(await screen.findByTestId('public-email-auth-form')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-app')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('returns to /admin after a successful login', async () => {
    render(<App />);

    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret123' } });
    fireEvent.submit(screen.getByTestId('public-email-auth-form'));

    await waitFor(() => expect(screen.getByTestId('admin-app')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/admin');
    expect(authService.loginWithEmailPassword).toHaveBeenCalledWith('admin@example.com', 'secret123');
  });
});
