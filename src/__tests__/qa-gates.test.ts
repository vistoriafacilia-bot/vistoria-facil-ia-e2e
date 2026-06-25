import { describe, expect, it, vi } from 'vitest';
import { Entitlement, Inspection, Photo, Property, Room } from '../types';

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-123', email: 'test@example.com' } },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import { validateInspectionCompletionGate, validateReportGenerationGate } from '../lib/qaGates';

const userId = 'user-1';

const property: Property = {
  id: 'prop-1',
  userId,
  nickname: 'Apto Teste',
  propertyType: 'apartamento',
  address: {
    street: 'Rua A',
    number: '10',
    neighborhood: 'Centro',
    city: 'Rio de Janeiro',
    state: 'RJ',
    zipCode: '20000-000'
  },
  createdAt: '2026-06-25T10:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z'
};

const inspection: Inspection = {
  id: 'insp-1',
  userId,
  propertyId: property.id,
  inspectionType: 'entrada',
  status: 'concluida',
  startedAt: '2026-06-25T10:00:00.000Z',
  completedAt: '2026-06-25T10:30:00.000Z',
  appVersion: 'V0.1.0'
};

const rooms: Room[] = [
  {
    id: 'room-1',
    inspectionId: inspection.id,
    userId,
    name: 'Sala',
    order: 0,
    isDefault: true,
    createdAt: '2026-06-25T10:00:00.000Z',
    updatedAt: '2026-06-25T10:00:00.000Z'
  }
];

const photo: Photo = {
  id: 'photo-1',
  inspectionId: inspection.id,
  roomId: rooms[0].id,
  roomName: rooms[0].name,
  userId,
  url: 'data:image/jpeg;base64,abc',
  caption: 'Parede - bom estado',
  displayTitle: 'Parede - bom estado',
  description: 'Parede em estado visual satisfatório.',
  aiAnalysis: {
    item_observado: 'Parede',
    condicao_sugerida: 'OK',
    descricao_neutra: 'Parede em estado visual satisfatório.',
    pontos_de_atencao: [],
    confianca: 'alta'
  },
  reviewedStatus: 'confirmado',
  reviewStatus: 'confirmed',
  analysisStatus: 'completed',
  createdAt: '2026-06-25T10:05:00.000Z'
};

const entitlement: Entitlement = {
  id: `${userId}_beta_paid_4990`,
  userId,
  planId: 'beta_paid_4990',
  status: 'active',
  source: 'mercado_pago',
  maxPhotosPerInspection: 50,
  pdfEnabled: true,
  createdAt: '2026-06-25T10:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z'
};

describe('QA gates for E2E hardening', () => {
  it('passes an internally consistent completed inspection', () => {
    const result = validateInspectionCompletionGate({
      inspection,
      property,
      rooms,
      photos: [photo],
      photoLimit: 50,
      userId
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks completion when there are no photos', () => {
    const result = validateInspectionCompletionGate({
      inspection,
      property,
      rooms,
      photos: [],
      photoLimit: 50,
      userId
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('PHOTOS_EMPTY');
  });

  it('blocks completion when photo limit is exceeded', () => {
    const photos = Array.from({ length: 11 }, (_, index) => ({ ...photo, id: `photo-${index + 1}` }));
    const result = validateInspectionCompletionGate({
      inspection,
      property,
      rooms,
      photos,
      photoLimit: 10,
      userId
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('PHOTO_LIMIT_EXCEEDED');
  });

  it('blocks completion when a photo belongs to a different room/inspection context', () => {
    const result = validateInspectionCompletionGate({
      inspection,
      property,
      rooms,
      photos: [{ ...photo, roomId: 'missing-room' }],
      photoLimit: 50,
      userId
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('PHOTO_INVALID_REFERENCE');
  });

  it('blocks completion while AI analysis is pending', () => {
    const result = validateInspectionCompletionGate({
      inspection,
      property,
      rooms,
      photos: [{ ...photo, analysisStatus: 'pending' }],
      photoLimit: 50,
      userId
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('AI_ANALYSIS_PENDING');
  });

  it('warns but does not block when AI fallback was applied', () => {
    const result = validateInspectionCompletionGate({
      inspection,
      property,
      rooms,
      photos: [{ ...photo, analysisStatus: 'failed', fallbackApplied: true }],
      photoLimit: 50,
      userId
    });

    expect(result.passed).toBe(true);
    expect(result.warnings.map(item => item.code)).toContain('AI_FALLBACK_APPLIED');
  });

  it('blocks report generation when entitlement is missing', () => {
    const result = validateReportGenerationGate({
      inspection,
      property,
      rooms,
      photos: [photo],
      photoLimit: 50,
      userId,
      entitlement: null
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('ENTITLEMENT_MISSING');
  });

  it('blocks report generation when entitlement is inactive', () => {
    const result = validateReportGenerationGate({
      inspection,
      property,
      rooms,
      photos: [photo],
      photoLimit: 50,
      userId,
      entitlement: { ...entitlement, status: 'pending' }
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('ENTITLEMENT_INACTIVE');
  });

  it('blocks report generation before the inspection is completed', () => {
    const result = validateReportGenerationGate({
      inspection: { ...inspection, status: 'em_andamento' },
      property,
      rooms,
      photos: [photo],
      photoLimit: 50,
      userId,
      entitlement
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('INSPECTION_NOT_COMPLETED');
  });

  it('passes report generation with completed inspection and active PDF entitlement', () => {
    const result = validateReportGenerationGate({
      inspection,
      property,
      rooms,
      photos: [photo],
      photoLimit: 50,
      userId,
      entitlement
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});
