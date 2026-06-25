import { describe, expect, it } from 'vitest';
import { buildMercadoPagoWebhookEventId, normalizeMercadoPagoPaymentSnapshot, validateApprovedPaymentForEntitlement } from '../lib/paymentGuards';

const order = {
  id: 'ord_user-1_20260624_abcd',
  userId: 'user-1',
  planId: 'beta_paid_4990',
  status: 'pending',
  amountCents: 4990,
  currency: 'BRL',
  preferenceId: 'pref-1'
};

const approvedPayment = {
  id: '123456789',
  status: 'approved',
  statusDetail: 'accredited',
  externalReference: order.id,
  metadata: {
    order_id: order.id,
    user_id: order.userId,
    plan_id: order.planId
  },
  amount: 49.9,
  currency: 'BRL',
  paymentMethodId: 'pix',
  paymentTypeId: 'bank_transfer'
};

describe('payment guards', () => {
  it('passes an approved Mercado Pago payment that matches order, amount, currency and metadata', () => {
    const result = validateApprovedPaymentForEntitlement({
      order,
      payment: approvedPayment,
      allowedPlanIds: ['free_10', 'beta_paid_4990']
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks entitlement when payment is approved but amount is different from order', () => {
    const result = validateApprovedPaymentForEntitlement({
      order,
      payment: { ...approvedPayment, amount: 1 },
      allowedPlanIds: ['free_10', 'beta_paid_4990']
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('PAYMENT_AMOUNT_MISMATCH');
  });

  it('blocks entitlement when payment references another order', () => {
    const result = validateApprovedPaymentForEntitlement({
      order,
      payment: { ...approvedPayment, externalReference: 'ord_other' },
      allowedPlanIds: ['free_10', 'beta_paid_4990']
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('ORDER_REFERENCE_MISMATCH');
  });

  it('blocks entitlement when provider metadata points to another user', () => {
    const result = validateApprovedPaymentForEntitlement({
      order,
      payment: { ...approvedPayment, metadata: { ...approvedPayment.metadata, user_id: 'user-2' } },
      allowedPlanIds: ['free_10', 'beta_paid_4990']
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('USER_METADATA_MISMATCH');
  });

  it('blocks entitlement when payment is still pending', () => {
    const result = validateApprovedPaymentForEntitlement({
      order,
      payment: { ...approvedPayment, status: 'pending' },
      allowedPlanIds: ['free_10', 'beta_paid_4990']
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('PAYMENT_NOT_APPROVED');
  });

  it('builds deterministic webhook event ids for duplicate notifications', () => {
    expect(buildMercadoPagoWebhookEventId({ paymentId: '123/456', eventType: 'payment.updated', status: 'approved' }))
      .toBe('mp_123_456_payment_updated_approved');
  });

  it('normalizes Mercado Pago raw payment payloads', () => {
    const normalized = normalizeMercadoPagoPaymentSnapshot({
      id: 123,
      status: 'approved',
      status_detail: 'accredited',
      external_reference: order.id,
      metadata: { order_id: order.id },
      transaction_amount: '49.9',
      currency_id: 'BRL',
      payment_method_id: 'pix',
      payment_type_id: 'bank_transfer'
    });

    expect(normalized).toMatchObject({
      id: '123',
      status: 'approved',
      externalReference: order.id,
      amount: 49.9,
      currency: 'BRL'
    });
  });
});
