import type { AppUser, Entitlement } from '../types';
import type { PaymentV1CreditStatus, PaymentV1StatusResponse } from './services/paymentV1Service';

export const buildPaymentV1Entitlement = (
  credit: PaymentV1CreditStatus,
  user?: AppUser,
): Entitlement => {
  const now = new Date().toISOString();

  return {
    id: `payment-v1-${credit.id}`,
    userId: user?.uid || user?.id || '',
    planId: 'beta_paid_4990',
    status: 'active',
    source: 'manual_admin',
    maxPhotosPerInspection: credit.analysisLimit,
    pdfEnabled: true,
    orderId: credit.orderId,
    paymentId: credit.id,
    preferenceId: null,
    createdAt: credit.createdAt || now,
    updatedAt: now,
    expiresAt: null,
  };
};

export const resolvePaymentV1Entitlement = (
  baseEntitlement: Entitlement,
  user: AppUser,
  paymentStatus?: PaymentV1StatusResponse | null,
): Entitlement => {
  const activeCredit = paymentStatus?.activeCredits.find((credit) => credit.status === 'active');
  return activeCredit ? buildPaymentV1Entitlement(activeCredit, user) : baseEntitlement;
};
