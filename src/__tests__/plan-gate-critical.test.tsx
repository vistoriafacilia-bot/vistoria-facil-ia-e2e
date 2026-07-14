import fs from 'node:fs';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlanGate from '../components/PlanGate';
import { PAYMENT_RETURN_POLL_INTERVAL_MS, PAYMENT_RETURN_POLL_TIMEOUT_MS } from '../components/PaymentV1Gate';
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
    window.history.pushState({}, '', '/');
    paymentV1Mocks.getPaymentV1Status.mockResolvedValue({
      hasActiveCredit: false,
      activeCredits: [],
      pendingOrders: [],
      paidOrders: [],
    });
    paymentV1Mocks.hasPaymentV1AuthSession.mockResolvedValue(false);
    paymentV1Mocks.reconcilePaymentV1.mockResolvedValue({
      pendingOrders: [],
      reconciledOrders: [],
      activeCredits: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.pushState({}, '', '/');
  });

  const flushPaymentReturnEffects = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('routes payment=success app load to the payment gate', () => {
    const appSource = fs.readFileSync('src/App.tsx', 'utf8');
    expect(appSource).toContain('getInitialAppView');
    expect(appSource).toContain("new URLSearchParams(window.location.search).get('payment') === 'success'");
    expect(appSource).toContain("? 'plans'");
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

  it('auto-confirms payment=success return until active credit unlocks entitlement', async () => {
    vi.useFakeTimers();
    window.history.pushState({}, '', '/?payment=success&keep=1');
    const onReadyMock = vi.fn();
    const onEntitlementSyncMock = vi.fn();
    let statusCalls = 0;
    const inactiveStatus = {
      hasActiveCredit: false,
      activeCredits: [],
      pendingOrders: [{
        id: 'order-return-001',
        planCode: 'report_50_beta',
        externalReference: 'vf-return-001',
        status: 'pending',
        amountCents: 4990,
        analysisLimit: 50,
      }],
      paidOrders: [],
    };
    const activeStatus = {
      hasActiveCredit: true,
      activeCredits: [{
        id: 'credit-return-001',
        orderId: 'order-return-001',
        planCode: 'report_50_beta',
        analysisLimit: 50,
        analysisUsed: 0,
        status: 'active',
        createdAt: '2026-07-14T00:00:00.000Z',
      }],
      pendingOrders: [],
      paidOrders: [],
    };
    paymentV1Mocks.getPaymentV1Status.mockImplementation(async () => {
      statusCalls += 1;
      return statusCalls >= 3 ? activeStatus : inactiveStatus;
    });

    render(
      <PlanGate
        user={testUser}
        onReady={onReadyMock}
        onEntitlementSync={onEntitlementSyncMock}
        autoContinueOnActiveEntitlement={false}
      />,
    );

    expect(screen.getByText('Confirmando pagamento...')).toBeInTheDocument();

    await flushPaymentReturnEffects();
    expect(window.location.search).toBe('?payment=success&keep=1');
    expect(paymentV1Mocks.getPaymentV1Status).toHaveBeenCalledTimes(2);
    expect(paymentV1Mocks.reconcilePaymentV1).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_RETURN_POLL_INTERVAL_MS);
    });
    await flushPaymentReturnEffects();

    expect(onEntitlementSyncMock).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'beta_paid_4990',
      maxPhotosPerInspection: 50,
      orderId: 'order-return-001',
      paymentId: 'credit-return-001',
    }));
    expect(window.location.search).toBe('?keep=1');
    expect(screen.queryByText('Confirmando pagamento...')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Pagamento confirmado\. Relat.rio liberado\./i)).toHaveLength(1);
    expect(screen.queryByText(/Pagamento em reestrutura..o/i)).not.toBeInTheDocument();
    expect(onReadyMock).not.toHaveBeenCalled();

    const callsAfterSuccess = paymentV1Mocks.getPaymentV1Status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_RETURN_POLL_INTERVAL_MS * 3);
    });
    expect(paymentV1Mocks.getPaymentV1Status).toHaveBeenCalledTimes(callsAfterSuccess);
  });

  it('stops payment=success polling after timeout when credit is not active', async () => {
    vi.useFakeTimers();
    window.history.pushState({}, '', '/?payment=success');
    const inactiveStatus = {
      hasActiveCredit: false,
      activeCredits: [],
      pendingOrders: [{
        id: 'order-timeout-001',
        planCode: 'report_50_beta',
        externalReference: 'vf-timeout-001',
        status: 'pending',
        amountCents: 4990,
        analysisLimit: 50,
      }],
      paidOrders: [],
    };
    paymentV1Mocks.getPaymentV1Status.mockResolvedValue(inactiveStatus);

    render(
      <PlanGate
        user={testUser}
        onReady={vi.fn()}
        onEntitlementSync={vi.fn()}
        autoContinueOnActiveEntitlement={false}
      />,
    );

    await flushPaymentReturnEffects();
    expect(window.location.search).toBe('?payment=success');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_RETURN_POLL_TIMEOUT_MS + PAYMENT_RETURN_POLL_INTERVAL_MS);
    });
    await flushPaymentReturnEffects();

    expect(screen.getByText('Seu pagamento ainda está sendo processado. Aguarde alguns instantes.')).toBeInTheDocument();

    const callsAfterTimeout = paymentV1Mocks.getPaymentV1Status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_RETURN_POLL_INTERVAL_MS * 2);
    });
    expect(paymentV1Mocks.getPaymentV1Status).toHaveBeenCalledTimes(callsAfterTimeout);
  });
});
