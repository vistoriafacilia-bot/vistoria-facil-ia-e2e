import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InspectionWizard from '../components/InspectionWizard';
import { Property, Inspection } from '../types';

// Dynamic mock store for rooms to simulate Firestore persistence
let mockRooms: any[] = [];

// Mock Firebase
vi.mock('../firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-123', email: 'test@example.com' },
  },
  OperationType: {
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
  },
  handleFirestoreError: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-collection'),
  doc: vi.fn(() => ({ id: 'mock-room-' + Math.random().toString(36).substr(2, 9) })),
  setDoc: vi.fn((ref: any, data: any) => {
    if (data && typeof data === 'object' && 'inspectionId' in data && 'name' in data) {
      if (!mockRooms.some(r => r.id === data.id)) {
        mockRooms.push(data);
      }
    }
    return Promise.resolve();
  }),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-add-doc-id' })),
  getDocs: vi.fn(() => Promise.resolve({
    empty: mockRooms.length === 0,
    forEach: (cb: any) => {
      mockRooms.forEach(room => {
        cb({
          id: room.id,
          data: () => room,
        });
      });
    },
    docs: mockRooms.map(room => ({
      id: room.id,
      data: () => room,
    })),
  })),
  query: vi.fn((col) => col),
  where: vi.fn(),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

describe('InspectionWizard Component Basic Tests', () => {
  const mockProperty: Property = {
    id: 'prop-1',
    userId: 'test-user-123',
    nickname: 'Apartamento Centro',
    propertyType: 'apartamento',
    address: {
      street: 'Av Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockInspection: Inspection = {
    id: 'insp-1',
    userId: 'test-user-123',
    propertyId: 'prop-1',
    inspectionType: 'entrada',
    status: 'rascunho',
    startedAt: new Date().toISOString(),
    appVersion: 'V0.1.0',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Pre-populate with our standard mock room
    mockRooms = [
      {
        id: 'room-1',
        inspectionId: 'insp-1',
        userId: 'test-user-123',
        name: 'Sala Estar',
        order: 0,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ];
  });

  it('renders the wizard with loaded rooms successfully', async () => {
    const mockBack = vi.fn();
    const mockCreated = vi.fn();
    const mockProceed = vi.fn();

    render(
      <InspectionWizard
        property={mockProperty}
        inspection={mockInspection}
        onBack={mockBack}
        onInspectionCreated={mockCreated}
        onProceedToReport={mockProceed}
      />
    );

    // Wait for the room to render on the page
    await waitFor(() => {
      expect(screen.getByText('Sala Estar')).toBeInTheDocument();
    });

    // Check some header details are visible using regex matches
    expect(screen.getByText(/Apartamento Centro/i)).toBeInTheDocument();
    expect(screen.getByText(/Vistoria de Entrada/i)).toBeInTheDocument();
  });

  it('allows adding a custom room via form submission', async () => {
    const mockBack = vi.fn();
    const mockCreated = vi.fn();
    const mockProceed = vi.fn();

    const { container } = render(
      <InspectionWizard
        property={mockProperty}
        inspection={mockInspection}
        onBack={mockBack}
        onInspectionCreated={mockCreated}
        onProceedToReport={mockProceed}
      />
    );

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.getByText('Sala Estar')).toBeInTheDocument();
    });

    // Find custom room text input and add a custom room
    const input = screen.getByPlaceholderText('Novo cômodo...');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Suíte Master' } });

    // Submit the room addition form
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    // Since firestore mock is dynamic, it updates local state on add.
    // Check that 'Suíte Master' is listed
    await waitFor(() => {
      expect(screen.getByText('Suíte Master')).toBeInTheDocument();
    });
  });
});
