import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanGate from '../components/PlanGate';
import type { AppUser } from '../types';

const paymentV1Mocks = vi.hoisted(() => ({
  createPaymentV1Checkout: vi.fn(),
  getPaymentV1DebugStatus: vi.fn(),
  getPaymentV1Status: vi.fn(),
  hasPaymentV1AuthSession: vi.fn(),
  reconcilePaymentV1: vi.fn(),
}));

vi.mock('../lib/services/paymentV1Service', () => ({
  createPaymentV1Checkout: paymentV1Mocks.createPaymentV1Checkout,
  getPaymentV1DebugStatus: paymentV1Mocks.getPaymentV1DebugStatus,
  getPaymentV1Status: paymentV1Mocks.getPaymentV1Status,
  hasPaymentV1AuthSession: paymentV1Mocks.hasPaymentV1AuthSession,
  reconcilePaymentV1: paymentV1Mocks.reconcilePaymentV1,
  PAYMENT_V1_PLANS: [
    {
      code: 'report_50_beta',
      name: 'Relatório 50',
      description: 'Relatório beta com até 50 análises',
      priceLabel: 'R$ 49,90',
      analysisLimit: 50,
    },
    {
      code: 'report_100',
      name: 'Relatório 100',
      description: 'Relatório beta com até 100 análises',
      priceLabel: 'R$ 99,90',
      analysisLimit: 100,
    },
    {
      code: 'report_150',
      name: 'Relatório 150',
      description: 'Relatório beta com até 150 análises',
      priceLabel: 'R$ 149,90',
      analysisLimit: 150,
    },
  ],
}));

describe('PlanGate critical error boundaries', () => {
  const testUser: AppUser = {
    uid: 'test-user-123',
    id: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Usuario Teste',
    photoURL: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    paymentV1Mocks.getPaymentV1Status.mockResolvedValue({
      hasActiveCredit: false,
      activeCredits: [],
      pendingOrders: [],
      paidOrders: [],
    });
    paymentV1Mocks.hasPaymentV1AuthSession.mockResolvedValue(false);
  });

  it('renders Payment V1 credit plans without resolving free_10 automatically', async () => {
    const onReadyMock = vi.fn();

    render(<PlanGate user={testUser} onReady={onReadyMock} autoContinueOnActiveEntitlement />);

    await waitFor(() => expect(paymentV1Mocks.getPaymentV1Status).toHaveBeenCalled());

    expect(screen.getByText(/Comprar cr.dito de relat.rio/i)).toBeInTheDocument();
    expect(screen.getByText(/Relat.rio 50/i)).toBeInTheDocument();
    expect(screen.getByText(/Relat.rio 100/i)).toBeInTheDocument();
    expect(screen.getByText(/Relat.rio 150/i)).toBeInTheDocument();
    expect(screen.queryByText(/Planos de Assinatura/i)).not.toBeInTheDocument();
    expect(onReadyMock).not.toHaveBeenCalled();
  });

  it('continues with beta_paid_4990 when an active Payment V1 credit is available', async () => {
    const onReadyMock = vi.fn();
    paymentV1Mocks.getPaymentV1Status.mockResolvedValue({
      hasActiveCredit: true,
      activeCredits: [{
        id: 'credit-001',
        orderId: 'order-001',
        planCode: 'report_50_beta',
        analysisLimit: 50,
        analysisUsed: 0,
        status: 'active',
        createdAt: '2026-07-13T00:00:00.000Z',
      }],
      pendingOrders: [],
      paidOrders: [],
    });

    render(<PlanGate user={testUser} onReady={onReadyMock} autoContinueOnActiveEntitlement />);

    await waitFor(() => {
      expect(onReadyMock).toHaveBeenCalledWith(expect.objectContaining({
        planId: 'beta_paid_4990',
        userId: testUser.uid,
        status: 'active',
        maxPhotosPerInspection: 50,
        pdfEnabled: true,
        orderId: 'order-001',
        paymentId: 'credit-001',
      }));
    });
  });

  it('syncs beta_paid_4990 entitlement without auto-continuing when active credit is available', async () => {
    const onReadyMock = vi.fn();
    const onEntitlementSyncMock = vi.fn();
    paymentV1Mocks.getPaymentV1Status.mockResolvedValue({
      hasActiveCredit: true,
      activeCredits: [{
        id: 'credit-sync-001',
        orderId: 'order-sync-001',
        planCode: 'report_50_beta',
        analysisLimit: 50,
        analysisUsed: 0,
        status: 'active',
        createdAt: '2026-07-13T00:00:00.000Z',
      }],
      pendingOrders: [],
      paidOrders: [],
    });

    render(
      <PlanGate
        user={testUser}
        onReady={onReadyMock}
        onEntitlementSync={onEntitlementSyncMock}
        autoContinueOnActiveEntitlement={false}
      />,
    );

    await waitFor(() => {
      expect(onEntitlementSyncMock).toHaveBeenCalledWith(expect.objectContaining({
        planId: 'beta_paid_4990',
        userId: testUser.uid,
        status: 'active',
        maxPhotosPerInspection: 50,
        pdfEnabled: true,
        orderId: 'order-sync-001',
        paymentId: 'credit-sync-001',
      }));
    });
    expect(onReadyMock).not.toHaveBeenCalled();
  });
});
