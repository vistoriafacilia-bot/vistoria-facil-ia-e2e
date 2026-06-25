import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PropertyManager from '../components/PropertyManager';

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
  doc: vi.fn(() => 'mock-doc'),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({
    empty: false,
    forEach: (cb: any) => {
      cb({
        id: 'prop-1',
        data: () => ({
          userId: 'test-user-123',
          nickname: 'Apartamento Centro',
          type: 'apartamento',
          address: {
            street: 'Av Paulista',
            number: '1000',
            complement: 'Apt 12',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01310-100',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    },
    docs: [
      {
        id: 'prop-1',
        data: () => ({
          userId: 'test-user-123',
          nickname: 'Apartamento Centro',
          type: 'apartamento',
          address: {
            street: 'Av Paulista',
            number: '1000',
            complement: 'Apt 12',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01310-100',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      }
    ],
  })),
  query: vi.fn((col) => col),
  where: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('PropertyManager Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders properties list correctly', async () => {
    const mockOnSelect = vi.fn();
    const mockOnViewHistory = vi.fn();

    render(
      <PropertyManager
        onSelectPropertyForInspection={mockOnSelect}
        onViewHistory={mockOnViewHistory}
      />
    );

    // Wait for properties to load
    await waitFor(() => {
      expect(screen.getByText('Apartamento Centro')).toBeInTheDocument();
    });

    // Check address details
    expect(screen.getByText(/Av Paulista/)).toBeInTheDocument();
  });

  it('opens property creation form when clicking the creation button', async () => {
    const mockOnSelect = vi.fn();
    const mockOnViewHistory = vi.fn();

    render(
      <PropertyManager
        onSelectPropertyForInspection={mockOnSelect}
        onViewHistory={mockOnViewHistory}
      />
    );

    // Wait for initial load to finish first
    await waitFor(() => {
      expect(screen.getByText('Meus Imóveis')).toBeInTheDocument();
    });

    // Find and click the register property button
    const registerButton = screen.getByText(/Cadastrar Imóvel/i);
    expect(registerButton).toBeInTheDocument();
    fireEvent.click(registerButton);

    // Verify form fields are shown using exact match of placeholder strings
    expect(screen.getByPlaceholderText('Apelido curto e reconhecível')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Avenida Paulista, Rua Augusta...')).toBeInTheDocument();
  });

  it('shows validation errors when saving with missing required fields', async () => {
    const mockOnSelect = vi.fn();
    const mockOnViewHistory = vi.fn();

    const { container } = render(
      <PropertyManager
        onSelectPropertyForInspection={mockOnSelect}
        onViewHistory={mockOnViewHistory}
      />
    );

    // Wait for initial load to finish first
    await waitFor(() => {
      expect(screen.getByText('Meus Imóveis')).toBeInTheDocument();
    });

    // Click register button
    const registerBtn = screen.getByText(/Cadastrar Imóvel/i);
    fireEvent.click(registerBtn);

    // Find the form and submit it directly to trigger custom onSubmit validation
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    // Verify validation error message is shown
    await waitFor(() => {
      expect(screen.getByText(/Por favor, preencha os campos obrigatórios/i)).toBeInTheDocument();
    });
  });
});
