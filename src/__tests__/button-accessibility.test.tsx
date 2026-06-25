import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Navbar from '../components/Navbar';
import ErrorBoundary from '../components/ErrorBoundary';

// Mock auth from ../firebase
vi.mock('../firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-123', email: 'test@example.com', displayName: 'Test User' },
  },
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
}));

describe('Button Accessibility and Semantics', () => {
  it('Navbar buttons should have explicit type attributes', () => {
    const onNavigateHome = vi.fn();
    const onToggleAdminMetrics = vi.fn();

    render(
      <Navbar
        user={{ uid: 'test-user-123', email: 'test@example.com', displayName: 'Test User' } as any}
        onNavigateHome={onNavigateHome}
        isAdminUser={true}
        showAdminMetrics={false}
        onToggleAdminMetrics={onToggleAdminMetrics}
      />
    );

    // Get all buttons and check their types
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach((button) => {
      const typeAttr = button.getAttribute('type');
      expect(typeAttr).toMatch(/^(button|submit|reset)$/);
    });
  });

  it('ErrorBoundary buttons should have explicit type attributes', () => {
    render(
      <ErrorBoundary>
        <div>Test Child</div>
      </ErrorBoundary>
    );

    // Let's force an error to trigger error UI
    const ThrowError = () => {
      throw new Error('Test Error');
    };

    // Prevent React's console error logs during this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach((button) => {
      const typeAttr = button.getAttribute('type');
      expect(typeAttr).toMatch(/^(button|submit|reset)$/);
    });

    consoleSpy.mockRestore();
  });
});
