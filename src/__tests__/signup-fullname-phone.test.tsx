import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatBrazilianMobilePhone,
  isValidBrazilianMobilePhone,
  isValidFullName,
  normalizeBrazilianMobilePhone,
  normalizeFullName,
} from '../lib/validation';

const authState = vi.hoisted(() => ({
  currentUser: null as any,
}));

const authService = vi.hoisted(() => ({
  loginWithEmailPassword: vi.fn(),
  loginWithGoogle: vi.fn(),
  onAuthStateChanged: vi.fn((callback: (user: any) => void) => {
    callback(authState.currentUser);
    return () => undefined;
  }),
  resetPasswordForEmail: vi.fn(),
  signUpWithEmailPassword: vi.fn(async () => ({
    user: {
      uid: 'signup-user-1',
      id: 'signup-user-1',
      email: 'maria@example.com',
      displayName: 'Maria Oliveira',
      phone: '11987654321',
    },
    needsEmailConfirmation: false,
  })),
  upsertProfile: vi.fn(),
}));

vi.mock('../lib/services/authService', () => authService);

import App from '../App';

const openSignup = async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Criar conta$/i }));
};

const fillValidSignup = () => {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria Oliveira' } });
  fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '(11) 98765-4321' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@example.com' } });
  fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText(/Confirmar senha/i), { target: { value: 'secret123' } });
};

describe('Signup full name and phone validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = null;
    window.history.replaceState({}, '', '/');
  });

  it('normalizes and validates signup identity fields', () => {
    expect(normalizeFullName('  Maria   Oliveira  ')).toBe('Maria Oliveira');
    expect(isValidFullName('Maria')).toBe(false);
    expect(isValidFullName('Maria Oliveira')).toBe(true);
    expect(formatBrazilianMobilePhone('11987654321')).toBe('(11) 98765-4321');
    expect(normalizeBrazilianMobilePhone('(11) 98765-4321')).toBe('11987654321');
    expect(isValidBrazilianMobilePhone('11987654321')).toBe(true);
    expect(isValidBrazilianMobilePhone('1187654321')).toBe(false);
    expect(isValidBrazilianMobilePhone('20987654321')).toBe(false);
  });

  it('rejects signup without full name', async () => {
    await openSignup();
    fillValidSignup();
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: '' } });

    fireEvent.submit(screen.getByTestId('public-email-auth-form'));

    expect(await screen.findByText('Informe seu nome completo.')).toBeInTheDocument();
    expect(authService.signUpWithEmailPassword).not.toHaveBeenCalled();
  });

  it('rejects signup without first and last name', async () => {
    await openSignup();
    fillValidSignup();
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria' } });

    fireEvent.submit(screen.getByTestId('public-email-auth-form'));

    expect(await screen.findByText('Informe nome e sobrenome para criar sua conta.')).toBeInTheDocument();
    expect(authService.signUpWithEmailPassword).not.toHaveBeenCalled();
  });

  it('rejects signup without phone', async () => {
    await openSignup();
    fillValidSignup();
    fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '' } });

    fireEvent.submit(screen.getByTestId('public-email-auth-form'));

    expect(await screen.findByText('Informe seu celular com DDD.')).toBeInTheDocument();
    expect(authService.signUpWithEmailPassword).not.toHaveBeenCalled();
  });

  it('rejects invalid Brazilian mobile phone', async () => {
    await openSignup();
    fillValidSignup();
    fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '11 1234-5678' } });

    fireEvent.submit(screen.getByTestId('public-email-auth-form'));

    expect(await screen.findByText('Informe um celular brasileiro valido com DDD e 11 digitos.')).toBeInTheDocument();
    expect(authService.signUpWithEmailPassword).not.toHaveBeenCalled();
  });

  it('submits valid signup with normalized full name and phone', async () => {
    await openSignup();
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: '  Maria   Oliveira  ' } });
    fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '11987654321' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText(/Confirmar senha/i), { target: { value: 'secret123' } });

    fireEvent.submit(screen.getByTestId('public-email-auth-form'));

    await waitFor(() => {
      expect(authService.signUpWithEmailPassword).toHaveBeenCalledWith(
        'maria@example.com',
        'secret123',
        { fullName: 'Maria Oliveira', phone: '11987654321' },
      );
    });
  });
});
