import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InspectionWizard from '../components/InspectionWizard';
import { Property, Inspection, Room, Entitlement, Photo } from '../types';
import { localList, localTestUser, localUpsert } from '../lib/supabaseLocalStore';

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

  const freeEntitlement: Entitlement = {
    id: `${localTestUser.uid}_free_10`,
    userId: localTestUser.uid,
    planId: 'free_10',
    status: 'active',
    source: 'free_self_service',
    maxPhotosPerInspection: 10,
    pdfEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const paidEntitlement: Entitlement = {
    id: `${localTestUser.uid}_paid_50`,
    userId: localTestUser.uid,
    planId: 'beta_paid_4990',
    status: 'active',
    source: 'manual_admin',
    maxPhotosPerInspection: 50,
    pdfEnabled: true,
    orderId: 'order-50',
    paymentId: 'credit-50',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('shows active paid credit copy with the correct analysis limit', async () => {
    render(
      <InspectionWizard
        property={mockProperty}
        inspection={mockInspection}
        onBack={vi.fn()}
        onInspectionCreated={vi.fn()}
        onProceedToReport={vi.fn()}
        entitlement={paidEntitlement}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Sala')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Pagamento em reestrutura..o/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Relat.rio liberado\. Voc. pode usar at. 50 an.lises neste relat.rio\./i)).toBeInTheDocument();
    expect(screen.getByText('0/50 análises')).toBeInTheDocument();
  });

  it('keeps coherent free-plan copy with the free analysis limit', async () => {
    render(
      <InspectionWizard
        property={mockProperty}
        inspection={mockInspection}
        onBack={vi.fn()}
        onInspectionCreated={vi.fn()}
        onProceedToReport={vi.fn()}
        entitlement={freeEntitlement}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Sala')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Pagamento em reestrutura..o/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Plano gratuito ativo\. Voc. pode usar at. 10 an.lises neste relat.rio\./i)).toBeInTheDocument();
    expect(screen.getByText('0/10 análises')).toBeInTheDocument();
  });

  it('persists the initial AI analysis response after a valid photo upload', async () => {
    const compressedDataUrl = 'data:image/jpeg;base64,dmFsaWQtcGhvdG8=';
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => compressedDataUrl,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    }) as typeof document.createElement);

    class MockImage {
      width = 800;
      height = 600;
      onload: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;

      set src(_value: string) {
        window.setTimeout(() => this.onload?.(), 0);
      }
    }

    vi.stubGlobal('Image', MockImage);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('data:image/')) {
        return {
          blob: vi.fn(async () => new Blob(['photo-bytes'], { type: 'image/jpeg' })),
        };
      }
      if (url === '/.netlify/functions/analyze-photo') {
        return {
          ok: true,
          json: vi.fn(async () => ({
            descricao_objetiva: 'Parede da sala',
            avarias_visiveis: ['Sem avarias relevantes'],
            observacao_sugerida: 'Parede da sala sem avarias relevantes neste enquadramento.',
            condicao_sugerida: 'OK',
            confianca: 'alta',
            requer_revisao_humana: false,
            model: 'gpt-4.1-mini',
            usage: { total_tokens: 48 },
            elapsed_ms: 1200,
          })),
        };
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InspectionWizard
        property={mockProperty}
        inspection={mockInspection}
        onBack={vi.fn()}
        onInspectionCreated={vi.fn()}
        onProceedToReport={vi.fn()}
        entitlement={freeEntitlement}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Sala')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('privacy-ai-upload-checkbox'));

    const fileInput = screen.getByTestId('privacy-gallery-file-input') as HTMLInputElement;
    await waitFor(() => {
      expect(fileInput).not.toBeDisabled();
    });

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['fake-image'], 'sala.jpg', { type: 'image/jpeg' })],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('photo-ai-completed-photo-0001')).toBeInTheDocument();
    });

    const analyzeCall = fetchMock.mock.calls.find(([url]) => String(url) === '/.netlify/functions/analyze-photo');
    expect(analyzeCall).toBeTruthy();
    expect(JSON.parse(String((analyzeCall?.[1] as RequestInit).body))).toEqual({
      imageBase64: compressedDataUrl,
      roomName: 'Sala',
    });

    const persistedPhoto = localList<Photo>('photos').find(photo => photo.id === 'photo-0001');
    expect(persistedPhoto?.analysisStatus).toBe('completed');
    expect(persistedPhoto?.fallbackApplied).toBe(false);
    expect(persistedPhoto?.description).toBe('Parede da sala sem avarias relevantes neste enquadramento.');
    expect(persistedPhoto?.aiAnalysis?.descricao_neutra).toBe('Parede da sala sem avarias relevantes neste enquadramento.');
  });
});
