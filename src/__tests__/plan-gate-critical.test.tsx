import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanGate from '../components/PlanGate';
import { Entitlement } from '../types';

const testUser = vi.hoisted(() => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Usuário Teste',
  getIdToken: vi.fn(async () => 'fake-token'),
}));

const queryMocks = vi.hoisted(() => ({
  shouldFailWithPermissionError: false,
  existingEntitlements: [] as any[],
}));

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: testUser },
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: vi.fn((err) => { throw err; }),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: testUser })),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ path: 'entitlements' })),
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  query: vi.fn((ref, ...clauses) => ({ ref, clauses })),
  getDocs: vi.fn(async () => {
    if (queryMocks.shouldFailWithPermissionError) {
      throw new Error('Missing or insufficient permissions');
    }
    return {
      empty: queryMocks.existingEntitlements.length === 0,
      forEach: (cb: any) => queryMocks.existingEntitlements.forEach(item => cb({ id: item.id, data: () => item })),
    };
  }),
  setDoc: vi.fn(async (ref, data) => {
    // Return mock success on write
  }),
}));

describe('PlanGate critical error boundaries', () => {
  beforeEach(() => {
    queryMocks.shouldFailWithPermissionError = false;
    queryMocks.existingEntitlements = [];
    vi.clearAllMocks();
  });

  it('resolves the local free entitlement without Firebase mocks', async () => {
    const onReadyMock = vi.fn();

    render(<PlanGate onReady={onReadyMock} />);

    await waitFor(() => {
      expect(onReadyMock).toHaveBeenCalledWith(expect.objectContaining({
        planId: 'free_10',
        userId: 'e2e-user-001',
        status: 'active',
      }));
    });
  });
});
