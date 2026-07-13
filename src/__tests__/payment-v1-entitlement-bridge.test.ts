import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppUser, Entitlement } from '../types';
import type { PaymentV1CreditStatus, PaymentV1StatusResponse } from '../lib/services/paymentV1Service';
import { buildPaymentV1Entitlement, resolvePaymentV1Entitlement } from '../lib/paymentV1EntitlementBridge';

const user: AppUser = {
  uid: 'user-123',
  id: 'legacy-user-123',
  email: 'user@example.com',
};

const baseEntitlement: Entitlement = {
  id: 'user-123_free_10',
  userId: user.uid,
  planId: 'free_10',
  status: 'active',
  source: 'free_self_service',
  maxPhotosPerInspection: 10,
  pdfEnabled: true,
  createdAt: '2026-07-13T10:00:00.000Z',
  updatedAt: '2026-07-13T10:00:00.000Z',
};

const createCredit = (analysisLimit: number): PaymentV1CreditStatus => ({
  id: `credit-${analysisLimit}`,
  orderId: `order-${analysisLimit}`,
  planCode: analysisLimit === 50 ? 'report_50_beta' : analysisLimit === 100 ? 'report_100' : 'report_150',
  analysisLimit,
  analysisUsed: 0,
  status: 'active',
  createdAt: '2026-07-13T09:00:00.000Z',
});

const statusWith = (...activeCredits: PaymentV1CreditStatus[]): PaymentV1StatusResponse => ({
  hasActiveCredit: activeCredits.length > 0,
  activeCredits,
  pendingOrders: [],
  paidOrders: [],
});

describe('Payment V1 entitlement bridge', () => {
  it('converts an active credit into a paid entitlement and preserves payment identifiers', () => {
    const credit = createCredit(50);

    expect(buildPaymentV1Entitlement(credit, user)).toMatchObject({
      id: 'payment-v1-credit-50',
      userId: user.uid,
      planId: 'beta_paid_4990',
      status: 'active',
      source: 'manual_admin',
      maxPhotosPerInspection: 50,
      pdfEnabled: true,
      orderId: 'order-50',
      paymentId: 'credit-50',
    });
  });

  it.each([50, 100, 150])('uses the active Payment V1 credit limit of %i', (analysisLimit) => {
    const effectiveEntitlement = resolvePaymentV1Entitlement(
      baseEntitlement,
      user,
      statusWith(createCredit(analysisLimit)),
    );

    expect(effectiveEntitlement.maxPhotosPerInspection).toBe(analysisLimit);
    expect(effectiveEntitlement.planId).toBe('beta_paid_4990');
  });

  it('keeps the base free entitlement when no active Payment V1 credit is available', () => {
    const finalizedCredit = { ...createCredit(50), status: 'finalized' as const };

    expect(resolvePaymentV1Entitlement(baseEntitlement, user, statusWith(finalizedCredit))).toBe(baseEntitlement);
    expect(resolvePaymentV1Entitlement(baseEntitlement, user, null)).toBe(baseEntitlement);
  });

  it('keeps the Payment V1 lookup and fallback in the App entitlement sync', () => {
    const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

    expect(appSource).toContain('const paymentStatus = await getPaymentV1Status();');
    expect(appSource).toContain('resolvePaymentV1Entitlement(baseEntitlement, user, paymentStatus)');
    expect(appSource).toContain("console.warn('Payment V1 entitlement status unavailable; using base entitlement.', error);");
  });
});
