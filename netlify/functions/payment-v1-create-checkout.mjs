import crypto from 'node:crypto';
import { createAsaasCheckout } from './_paymentV1/asaasClient.mjs';
import { errorResponseBody, toPaymentV1Error } from './_paymentV1/paymentErrors.mjs';
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
    const error = new Error('Invalid JSON body.');
    error.debugCode = 'payment_v1_invalid_json';
    error.statusCode = 400;
    throw error;
  }
};

export const handler = async (event = {}) => {
  const requestId = crypto.randomUUID();
  try {
    if (event.httpMethod && event.httpMethod !== 'POST') {
      const error = new Error('Method not allowed.');
      error.debugCode = 'payment_v1_method_not_allowed';
      error.statusCode = 405;
      throw error;
    }

    const { planCode } = parseBody(event);
    const plan = getPaymentV1Plan(planCode);
    if (!plan) {
      const error = new Error('Invalid Payment V1 plan.');
      error.debugCode = 'payment_v1_invalid_plan';
      error.statusCode = 400;
      throw error;
    }

    const checkout = await createAsaasCheckout({ plan });
    return json(200, {
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
      planCode: checkout.planCode,
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error);
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};
