import crypto from 'node:crypto';
import { createAsaasCheckout } from './_paymentV1/asaasClient.mjs';
import { authenticatePaymentV1Request } from './_paymentV1/paymentAuth.mjs';
import { errorResponseBody, PaymentV1Error, toPaymentV1Error } from './_paymentV1/paymentErrors.mjs';
import { buildPaymentV1ExternalReference, createPaymentOrderStore } from './_paymentV1/paymentOrders.mjs';
import { getPaymentV1Plan } from './_paymentV1/paymentPlans.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

const parseBody = (event) => {
  if (!event?.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new PaymentV1Error('Invalid JSON body.', {
      debugCode: 'payment_v1_invalid_json',
      statusCode: 400,
    });
  }
};

export const createHandler = ({
  asaasClient = { createAsaasCheckout },
  paymentOrders = null,
  buildExternalReference = buildPaymentV1ExternalReference,
  authenticateRequest = authenticatePaymentV1Request,
} = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  try {
    if (event.httpMethod && event.httpMethod !== 'POST') {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    const authUser = await authenticateRequest({ event });

    const { planCode } = parseBody(event);
    if (!planCode) {
      throw new PaymentV1Error('Missing planCode.', {
        debugCode: 'missing_plan_code',
        statusCode: 400,
      });
    }

    const plan = getPaymentV1Plan(planCode);
    if (!plan) {
      throw new PaymentV1Error('Invalid Payment V1 plan.', {
        debugCode: 'plan_not_found',
        statusCode: 400,
      });
    }

    const orderStore = paymentOrders || createPaymentOrderStore();
    const externalReference = buildExternalReference({ planCode: plan.code });
    const order = await orderStore.createPendingOrder({ plan, externalReference, userId: authUser.userId });
    const checkout = await asaasClient.createAsaasCheckout({ plan, externalReference });
    await orderStore.updateOrderCheckout({
      orderId: order.id,
      checkoutId: checkout.checkoutId,
      checkoutUrl: checkout.checkoutUrl,
    });

    return json(200, {
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
      orderId: order.id,
      planCode: checkout.planCode,
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'unexpected_error');
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
