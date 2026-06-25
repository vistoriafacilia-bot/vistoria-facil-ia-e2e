import { describe, expect, it, vi } from 'vitest';
import { Entitlement } from '../types';

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

import { canGeneratePdf, getPhotoLimitForEntitlement, selectBestActiveEntitlement } from '../lib/entitlements';

const baseEntitlement: Entitlement = {
  id: 'user_free_10',
  userId: 'user-1',
  planId: 'free_10',
  status: 'active',
  source: 'free_self_service',
  maxPhotosPerInspection: 10,
  pdfEnabled: true,
  createdAt: '2026-06-25T10:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z'
};

describe('entitlement rules', () => {
  it('uses free photo limit when no entitlement is available', () => {
    expect(getPhotoLimitForEntitlement(null)).toBe(10);
  });

  it('returns photo limit from an active entitlement', () => {
    expect(getPhotoLimitForEntitlement({ ...baseEntitlement, maxPhotosPerInspection: 50 })).toBe(50);
  });

  it('selects paid active entitlement over free entitlement', () => {
    const paid: Entitlement = {
      ...baseEntitlement,
      id: 'user_beta_paid_4990',
      planId: 'beta_paid_4990',
      source: 'mercado_pago',
      maxPhotosPerInspection: 50
    };
    expect(selectBestActiveEntitlement([baseEntitlement, paid])?.planId).toBe('beta_paid_4990');
  });

  it('ignores expired entitlements', () => {
    const expired: Entitlement = {
      ...baseEntitlement,
      expiresAt: '2020-01-01T00:00:00.000Z'
    };
    expect(selectBestActiveEntitlement([expired], new Date('2026-06-25T10:00:00.000Z'))).toBeNull();
  });

  it('allows PDF only with active entitlement and pdf flag enabled', () => {
    expect(canGeneratePdf(baseEntitlement)).toBe(true);
    expect(canGeneratePdf({ ...baseEntitlement, pdfEnabled: false })).toBe(false);
    expect(canGeneratePdf({ ...baseEntitlement, status: 'pending' })).toBe(false);
  });
});
