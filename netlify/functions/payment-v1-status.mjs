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

const safeLog = (level, { requestId, step, stage, debugCode, userId, orderId, externalReference, checkoutId, error }) => {
  const resolvedStage = stage || step;
  const payload = {
    scope: 'payment-v1-status',
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

const normalizeStatusRows = (status = {}) => ({
  activeCredits: Array.isArray(status.activeCredits) ? status.activeCredits : [],
  pendingOrders: Array.isArray(status.pendingOrders) ? status.pendingOrders : [],
  paidOrders: Array.isArray(status.paidOrders) ? status.paidOrders : [],
});

const validateSupabaseStatusEnv = (env = process.env) => {
  if (!env.SUPABASE_URL) {
    throw new PaymentV1Error('Supabase URL is missing.', {
      debugCode: 'missing_supabase_url',
      statusCode: 500,
    });
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new PaymentV1Error('Supabase service role key is missing.', {
      debugCode: 'missing_supabase_service_role_key',
      statusCode: 500,
    });
  }
};

export const createHandler = ({
  paymentOrders = null,
  authenticateRequest = authenticatePaymentV1Request,
  env = process.env,
} = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  const logContext = {};
  try {
    if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    if (!paymentOrders || authenticateRequest === authenticatePaymentV1Request) {
      validateSupabaseStatusEnv(env);
    }

    safeLog('info', { requestId, stage: 'auth_start', debugCode: 'status_auth_start' });
    const authUser = await authenticateRequest({ event, env });
    if (!authUser?.userId) {
      throw new PaymentV1Error('Authorization bearer token is invalid.', {
        debugCode: 'invalid_auth_token',
        statusCode: 401,
      });
    }
    logContext.userId = authUser.userId;

    safeLog('info', { requestId, stage: 'query_start', debugCode: 'status_query_start', userId: authUser.userId });
    const orderStore = paymentOrders || createPaymentOrderStore({ env });
    const status = normalizeStatusRows(await orderStore.getPaymentStatusForUser({ userId: authUser.userId }));
    const activeCredits = status.activeCredits.map(publicCredit);
    const pendingOrders = status.pendingOrders.map(publicOrder);
    const paidOrders = status.paidOrders.map(publicOrder);
    const firstOrder = pendingOrders[0] || paidOrders[0] || null;
    if (firstOrder) {
      logContext.orderId = firstOrder.id;
      logContext.externalReference = firstOrder.externalReference;
      logContext.checkoutId = firstOrder.providerCheckoutId;
    }

    safeLog('info', {
      requestId,
      stage: 'status_success',
      debugCode: 'status_ok',
      userId: authUser.userId,
      ...logContext,
    });
    return json(200, {
      hasActiveCredit: activeCredits.length > 0,
      activeCredits,
      pendingOrders,
      paidOrders,
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'status_unexpected_error');
    safeLog('error', {
      requestId,
      stage: 'status_failed',
      debugCode: paymentError.debugCode || 'status_unexpected_error',
      ...logContext,
      error: paymentError,
    });
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
