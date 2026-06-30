import crypto from 'node:crypto';
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

const safeLog = (level, { requestId, stage, debugCode, userId, orderId, externalReference, checkoutId, error }) => {
  const payload = {
    scope: 'payment-v1-debug-status',
    requestId,
    stage,
    step: stage,
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
      supabaseStatus: error.supabaseStatus,
      details: error.details,
    });
  }
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
};

const publicOrder = (order) => ({
  id: order.id,
  planCode: order.plan_code,
  provider: order.provider,
  providerCheckoutId: order.provider_checkout_id || null,
  externalReference: order.external_reference,
  status: order.status,
  amountCents: order.amount_cents,
  analysisLimit: order.analysis_limit,
  paidAt: order.paid_at || null,
  createdAt: order.created_at,
  updatedAt: order.updated_at,
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

const publicEvent = (event) => ({
  id: event.id,
  provider: event.provider,
  eventId: event.event_id,
  eventType: event.event_type,
  providerCheckoutId: event.provider_checkout_id || null,
  externalReference: event.external_reference || null,
  processedAt: event.processed_at || null,
  createdAt: event.created_at,
});

const emptyDebugStatus = (userId) => ({
  userId,
  latestOrders: [],
  latestCredits: [],
  latestEvents: [],
  counts: {
    ordersCount: 0,
    pendingOrdersCount: 0,
    paidOrdersCount: 0,
    creditsCount: 0,
    activeCreditsCount: 0,
    eventsCount: 0,
  },
});

const buildDebugStatus = ({ userId, orders, credits, events }) => {
  const latestOrders = (Array.isArray(orders) ? orders : []).map(publicOrder);
  const latestCredits = (Array.isArray(credits) ? credits : []).map(publicCredit);
  const latestEvents = (Array.isArray(events) ? events : []).map(publicEvent);

  return {
    ...emptyDebugStatus(userId),
    latestOrders,
    latestCredits,
    latestEvents,
    counts: {
      ordersCount: latestOrders.length,
      pendingOrdersCount: latestOrders.filter((order) => order.status === 'pending').length,
      paidOrdersCount: latestOrders.filter((order) => order.status === 'paid').length,
      creditsCount: latestCredits.length,
      activeCreditsCount: latestCredits.filter((credit) => credit.status === 'active').length,
      eventsCount: latestEvents.length,
    },
  };
};

export const createHandler = ({
  paymentOrders = null,
  authenticateRequest = authenticatePaymentV1Request,
  env = process.env,
} = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  try {
    if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    safeLog('info', { requestId, stage: 'debug_auth_start', debugCode: 'debug_auth_start' });
    const authUser = await authenticateRequest({ event, env });
    if (!authUser?.userId) {
      throw new PaymentV1Error('Authorization bearer token is invalid.', {
        debugCode: 'invalid_auth_token',
        statusCode: 401,
      });
    }

    safeLog('info', { requestId, stage: 'debug_query_start', debugCode: 'debug_query_start', userId: authUser.userId });
    const orderStore = paymentOrders || createPaymentOrderStore({ env });
    const orders = await orderStore.listRecentOrdersForUser({ userId: authUser.userId });
    const credits = typeof orderStore.listRecentCreditsForUser === 'function'
      ? await orderStore.listRecentCreditsForUser({ userId: authUser.userId })
      : await orderStore.listActiveCreditsForUser({ userId: authUser.userId });
    const events = typeof orderStore.listRecentEventsForOrders === 'function'
      ? await orderStore.listRecentEventsForOrders({ orders })
      : [];
    const firstOrder = Array.isArray(orders) ? orders[0] : null;

    safeLog('info', {
      requestId,
      stage: 'debug_success',
      debugCode: 'debug_status_ok',
      userId: authUser.userId,
      orderId: firstOrder?.id,
      externalReference: firstOrder?.external_reference,
      checkoutId: firstOrder?.provider_checkout_id,
    });
    return json(200, {
      ...buildDebugStatus({ userId: authUser.userId, orders, credits, events }),
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'debug_status_unexpected_error');
    safeLog('error', {
      requestId,
      stage: 'debug_failed',
      debugCode: paymentError.debugCode || 'debug_status_unexpected_error',
      error: paymentError,
    });
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
