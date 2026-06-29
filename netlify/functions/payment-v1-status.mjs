import crypto from 'node:crypto';
import { authenticatePaymentV1Request } from './_paymentV1/paymentAuth.mjs';
import { errorResponseBody, PaymentV1Error, toPaymentV1Error } from './_paymentV1/paymentErrors.mjs';
import { createPaymentOrderStore } from './_paymentV1/paymentOrders.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

const publicCredit = (credit) => ({
  id: credit.id,
  orderId: credit.order_id,
  planCode: credit.plan_code,
  analysisLimit: credit.analysis_limit,
  analysisUsed: credit.analysis_used,
  status: credit.status,
  createdAt: credit.created_at,
  finalizedAt: credit.finalized_at || null,
});

const publicOrder = (order) => ({
  id: order.id,
  planCode: order.plan_code,
  providerCheckoutId: order.provider_checkout_id || null,
  checkoutUrl: order.checkout_url || null,
  externalReference: order.external_reference,
  status: order.status,
  amountCents: order.amount_cents,
  analysisLimit: order.analysis_limit,
  paidAt: order.paid_at || null,
  createdAt: order.created_at,
  updatedAt: order.updated_at,
});

export const createHandler = ({
  paymentOrders = null,
  authenticateRequest = authenticatePaymentV1Request,
} = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  try {
    if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    const authUser = await authenticateRequest({ event });
    const orderStore = paymentOrders || createPaymentOrderStore();
    const status = await orderStore.getPaymentStatusForUser({ userId: authUser.userId });
    const activeCredits = status.activeCredits.map(publicCredit);
    const pendingOrders = status.pendingOrders.map(publicOrder);
    const paidOrders = status.paidOrders.map(publicOrder);

    return json(200, {
      hasActiveCredit: activeCredits.length > 0,
      activeCredits,
      pendingOrders,
      paidOrders,
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'unexpected_error');
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);