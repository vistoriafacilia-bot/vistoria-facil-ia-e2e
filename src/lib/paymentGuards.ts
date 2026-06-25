export interface StoredOrderSnapshot {
  id: string;
  userId: string;
  planId: string;
  status?: string | null;
  amountCents: number;
  currency: string;
  preferenceId?: string | null;
}

export interface ProviderPaymentSnapshot {
  id: string;
  status?: string | null;
  statusDetail?: string | null;
  externalReference?: string | null;
  metadata?: Record<string, any> | null;
  amount?: number | null;
  currency?: string | null;
  paymentMethodId?: string | null;
  paymentTypeId?: string | null;
}

export interface PaymentValidationResult {
  passed: boolean;
  blockers: string[];
  warnings: string[];
}

const asString = (value: unknown) => (value === null || value === undefined ? '' : String(value));

const centsFromAmount = (amount?: number | null) => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return null;
  return Math.round(Number(amount) * 100);
};

export const buildMercadoPagoWebhookEventId = (params: {
  paymentId: string;
  eventType?: string | null;
  status?: string | null;
}) => {
  const paymentId = asString(params.paymentId).replace(/[^a-zA-Z0-9_-]+/g, '_') || 'unknown_payment';
  const eventType = asString(params.eventType || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'unknown_event';
  const status = asString(params.status || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'unknown_status';
  return `mp_${paymentId}_${eventType}_${status}`.slice(0, 180);
};

export const normalizeMercadoPagoPaymentSnapshot = (payment: any): ProviderPaymentSnapshot => ({
  id: String(payment?.id || ''),
  status: payment?.status || null,
  statusDetail: payment?.status_detail || null,
  externalReference: payment?.external_reference || null,
  metadata: payment?.metadata || null,
  amount: typeof payment?.transaction_amount === 'number' ? payment.transaction_amount : Number(payment?.transaction_amount),
  currency: payment?.currency_id || null,
  paymentMethodId: payment?.payment_method_id || null,
  paymentTypeId: payment?.payment_type_id || null
});

export const validateApprovedPaymentForEntitlement = ({
  order,
  payment,
  allowedPlanIds
}: {
  order: StoredOrderSnapshot | null | undefined;
  payment: ProviderPaymentSnapshot;
  allowedPlanIds: string[];
}): PaymentValidationResult => {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!order) {
    blockers.push('ORDER_NOT_FOUND');
    return { passed: false, blockers, warnings };
  }

  if (!payment.id) {
    blockers.push('PAYMENT_ID_MISSING');
  }

  if (payment.status !== 'approved') {
    blockers.push('PAYMENT_NOT_APPROVED');
  }

  const metadataOrderId = asString(payment.metadata?.order_id);
  const externalReference = asString(payment.externalReference);
  if (!externalReference && !metadataOrderId) {
    blockers.push('ORDER_REFERENCE_MISSING');
  }
  if (externalReference && externalReference !== order.id) {
    blockers.push('ORDER_REFERENCE_MISMATCH');
  }
  if (metadataOrderId && metadataOrderId !== order.id) {
    blockers.push('ORDER_METADATA_MISMATCH');
  }

  const metadataUserId = asString(payment.metadata?.user_id);
  if (metadataUserId && metadataUserId !== order.userId) {
    blockers.push('USER_METADATA_MISMATCH');
  }

  const metadataPlanId = asString(payment.metadata?.plan_id);
  if (metadataPlanId && metadataPlanId !== order.planId) {
    blockers.push('PLAN_METADATA_MISMATCH');
  }

  if (!allowedPlanIds.includes(order.planId)) {
    blockers.push('PLAN_NOT_ALLOWED');
  }

  const paidCents = centsFromAmount(payment.amount);
  if (paidCents === null) {
    blockers.push('PAYMENT_AMOUNT_MISSING');
  } else if (paidCents !== order.amountCents) {
    blockers.push('PAYMENT_AMOUNT_MISMATCH');
  }

  if (payment.currency && payment.currency !== order.currency) {
    blockers.push('PAYMENT_CURRENCY_MISMATCH');
  }

  if (!payment.currency) {
    warnings.push('PAYMENT_CURRENCY_MISSING');
  }

  if (!payment.paymentTypeId) {
    warnings.push('PAYMENT_TYPE_MISSING');
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings
  };
};
