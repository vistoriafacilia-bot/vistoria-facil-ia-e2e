import crypto from 'node:crypto';
import { getAsaasPaymentConfirmation } from './_paymentV1/asaasClient.mjs';
import { authenticatePaymentV1Request } from './_paymentV1/paymentAuth.mjs';
import { errorResponseBody, PaymentV1Error, sanitizeForPaymentLog, toPaymentV1Error } from './_paymentV1/paymentErrors.mjs';
import { createPaymentOrderStore } from './_paymentV1/paymentOrders.mjs';

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

const safeLog = (level, { requestId, stage, debugCode, userId, orderId, externalReference, checkoutId, lookupResult, error }) => {
  const payload = {
    scope: 'payment-v1-reconcile',
    requestId,
    stage,
    step: stage,
    debugCode,
  };
  if (userId) payload.userId = maskUserId(userId);
  if (orderId) payload.orderId = orderId;
  if (externalReference) payload.externalReference = externalReference;
  if (checkoutId) payload.providerCheckoutId = checkoutId;
  if (lookupResult) {
    payload.lookupResult = sanitizeForPaymentLog({
      confirmed: lookupResult.confirmed,
      matchedBy: lookupResult.matchedBy,
      status: lookupResult.status,
      asaasStatus: lookupResult.asaasStatus,
      responseKeys: lookupResult.responseKeys,
    });
  }
  if (error) {
    payload.error = sanitizeForPaymentLog({
      name: error.name,
      message: error.message,
      debugCode: error.debugCode,
      statusCode: error.statusCode,
      asaasStatus: error.asaasStatus,
      supabaseStatus: error.supabaseStatus,
      details: error.details,
    });
  }
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
};

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

const getPendingOrdersForUser = async ({ orderStore, userId }) => {
  const orders = typeof orderStore.listRecentOrdersForUser === 'function'
    ? await orderStore.listRecentOrdersForUser({ userId })
    : [];
  return (Array.isArray(orders) ? orders : []).filter((order) => order.status === 'pending');
};

export const createHandler = ({
  paymentOrders = null,
  authenticateRequest = authenticatePaymentV1Request,
  asaasClient = { getAsaasPaymentConfirmation },
  env = process.env,
} = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  const logContext = {};
  try {
    if (event.httpMethod && !['POST', 'GET'].includes(event.httpMethod)) {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    safeLog('info', { requestId, stage: 'reconcile_auth_start', debugCode: 'reconcile_auth_start' });
    const authUser = await authenticateRequest({ event, env });
    if (!authUser?.userId) {
      throw new PaymentV1Error('Authorization bearer token is invalid.', {
        debugCode: 'invalid_auth_token',
        statusCode: 401,
      });
    }
    logContext.userId = authUser.userId;

    safeLog('info', { requestId, stage: 'reconcile_query_pending_start', debugCode: 'reconcile_query_pending_start', userId: authUser.userId });
    const orderStore = paymentOrders || createPaymentOrderStore({ env });
    const pendingOrdersBefore = await getPendingOrdersForUser({ orderStore, userId: authUser.userId });
    const reconciledOrders = [];

    for (const order of pendingOrdersBefore) {
      logContext.orderId = order.id;
      logContext.externalReference = order.external_reference;
      logContext.checkoutId = order.provider_checkout_id;
      safeLog('info', {
        requestId,
        stage: 'reconcile_asaas_lookup_start',
        debugCode: 'reconcile_asaas_lookup_start',
        userId: authUser.userId,
        orderId: order.id,
        externalReference: order.external_reference,
        checkoutId: order.provider_checkout_id,
      });

      const lookupResult = await asaasClient.getAsaasPaymentConfirmation({
        checkoutId: order.provider_checkout_id,
        externalReference: order.external_reference,
        env,
      });
      safeLog('info', {
        requestId,
        stage: lookupResult.confirmed ? 'reconcile_asaas_paid' : 'reconcile_asaas_not_confirmed',
        debugCode: lookupResult.confirmed ? 'reconcile_asaas_paid' : 'reconcile_asaas_not_confirmed',
        userId: authUser.userId,
        orderId: order.id,
        externalReference: order.external_reference,
        checkoutId: order.provider_checkout_id,
        lookupResult,
      });

      if (!lookupResult.confirmed) continue;

      const paidOrder = await orderStore.updateOrderStatus({ orderId: order.id, status: 'paid' });
      await orderStore.createCreditForOrderOnce({ order: paidOrder || order });
      reconciledOrders.push(paidOrder || { ...order, status: 'paid' });
    }

    const pendingOrdersAfter = await getPendingOrdersForUser({ orderStore, userId: authUser.userId });
    const activeCredits = typeof orderStore.listActiveCreditsForUser === 'function'
      ? await orderStore.listActiveCreditsForUser({ userId: authUser.userId })
      : [];

    safeLog('info', {
      requestId,
      stage: 'reconcile_success',
      debugCode: 'reconcile_ok',
      userId: authUser.userId,
      ...logContext,
    });

    return json(200, {
      pendingOrders: pendingOrdersAfter.map(publicOrder),
      reconciledOrders: reconciledOrders.map(publicOrder),
      activeCredits: (Array.isArray(activeCredits) ? activeCredits : []).map(publicCredit),
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'reconcile_unexpected_error');
    safeLog('error', {
      requestId,
      stage: 'reconcile_failed',
      debugCode: paymentError.debugCode || 'reconcile_unexpected_error',
      ...logContext,
      error: paymentError,
    });
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
