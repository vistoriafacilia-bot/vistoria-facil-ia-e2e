import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InspectionWizard from '../components/InspectionWizard';
import { Property, Inspection, Room } from '../types';
import { localTestUser, localUpsert } from '../lib/supabaseLocalStore';

describe('InspectionWizard Component Basic Tests', () => {
  const mockProperty: Property = {
    id: 'prop-1',
    userId: localTestUser.uid,
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
    userId: localTestUser.uid,
    propertyId: 'prop-1',
    inspectionType: 'entrada',
    status: 'rascunho',
    startedAt: new Date().toISOString(),
    appVersion: 'V0.1.0',
  };

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    const persistedRoom: Room = {
      id: 'room-1',
      inspectionId: 'insp-1',
      userId: localTestUser.uid,
      name: 'Sala',
      order: 0,
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localUpsert('rooms', persistedRoom);
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
      expect(screen.getByText('Sala')).toBeInTheDocument();
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
      expect(screen.getByText('Sala')).toBeInTheDocument();
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
