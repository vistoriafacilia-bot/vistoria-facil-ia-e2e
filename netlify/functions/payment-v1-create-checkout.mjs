import crypto from 'node:crypto';
import { createAsaasCheckout } from './_paymentV1/asaasClient.mjs';
import { authenticatePaymentV1Request } from './_paymentV1/paymentAuth.mjs';
import { errorResponseBody, PaymentV1Error, sanitizeForPaymentLog, toPaymentV1Error } from './_paymentV1/paymentErrors.mjs';
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

const maskUserId = (userId) => {
  const value = String(userId || '');
  if (value.length <= 8) return value ? '[masked]' : null;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const safeLog = (level, { requestId, step, stage, debugCode, userId, orderId, externalReference, checkoutId, error }) => {
  const resolvedStage = stage || step;
  const payload = {
    scope: 'payment-v1-create-checkout',
    requestId,
    step: resolvedStage,
    stage: resolvedStage,
    debugCode,
  };
  if (userId) payload.userId = maskUserId(userId);
  if (orderId) payload.orderId = orderId;
  if (externalReference) payload.externalReference = externalReference;
  if (checkoutId) payload.checkoutId = checkoutId;
  if (error) {
    payload.error = sanitizeForPaymentLog({
      name: error.name,
      message: error.message,
      debugCode: error.debugCode,
      statusCode: error.statusCode,
      asaasStatus: error.asaasStatus,
      details: error.details,
    });
  }
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
};

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
  env = process.env,
} = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  const logContext = {};
  try {
    if (event.httpMethod && event.httpMethod !== 'POST') {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    safeLog('info', { requestId, stage: 'auth_start', debugCode: 'checkout_auth_start' });
    const authUser = await authenticateRequest({ event, env });
    if (!authUser?.userId) {
      throw new PaymentV1Error('Authorization bearer token is invalid.', {
        debugCode: 'invalid_auth_token',
        statusCode: 401,
      });
    }
    logContext.userId = authUser.userId;

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

    const orderStore = paymentOrders || createPaymentOrderStore({ env });
    const externalReference = buildExternalReference({ planCode: plan.code });
    logContext.externalReference = externalReference;
    safeLog('info', { requestId, stage: 'order_create_start', debugCode: 'checkout_order_create_start', userId: authUser.userId, externalReference });
    const order = await orderStore.createPendingOrder({ plan, externalReference, userId: authUser.userId });
    logContext.orderId = order.id;
    safeLog('info', { requestId, stage: 'asaas_checkout_start', debugCode: 'checkout_asaas_start', userId: authUser.userId, orderId: order.id, externalReference });
    const checkout = await asaasClient.createAsaasCheckout({ plan, externalReference, env });
    logContext.checkoutId = checkout.checkoutId;
    await orderStore.updateOrderCheckout({
      orderId: order.id,
      checkoutId: checkout.checkoutId,
      checkoutUrl: checkout.checkoutUrl,
    });

    safeLog('info', {
      requestId,
      stage: 'checkout_success',
      debugCode: 'checkout_ok',
      userId: authUser.userId,
      orderId: order.id,
      externalReference,
      checkoutId: checkout.checkoutId,
    });
    return json(200, {
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
      orderId: order.id,
      externalReference,
      planCode: checkout.planCode,
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'checkout_unhandled_error');
    safeLog('error', {
      requestId,
      stage: 'checkout_failed',
      debugCode: paymentError.debugCode || 'checkout_unhandled_error',
      ...logContext,
      error: paymentError,
    });
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
