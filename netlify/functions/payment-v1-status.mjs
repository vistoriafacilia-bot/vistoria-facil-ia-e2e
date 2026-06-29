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

const safeLog = (level, { requestId, step, debugCode, error }) => {
  const payload = {
    scope: 'payment-v1-status',
    requestId,
    step,
    debugCode,
  };
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

    safeLog('info', { requestId, step: 'auth_start', debugCode: 'status_auth_start' });
    const authUser = await authenticateRequest({ event, env });
    if (!authUser?.userId) {
      throw new PaymentV1Error('Authorization bearer token is invalid.', {
        debugCode: 'invalid_auth_token',
        statusCode: 401,
      });
    }

    safeLog('info', { requestId, step: 'query_start', debugCode: 'status_query_start' });
    const orderStore = paymentOrders || createPaymentOrderStore({ env });
    const status = normalizeStatusRows(await orderStore.getPaymentStatusForUser({ userId: authUser.userId }));
    const activeCredits = status.activeCredits.map(publicCredit);
    const pendingOrders = status.pendingOrders.map(publicOrder);
    const paidOrders = status.paidOrders.map(publicOrder);

    safeLog('info', { requestId, step: 'status_success', debugCode: 'status_ok' });
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
      step: 'status_failed',
      debugCode: paymentError.debugCode || 'status_unexpected_error',
      error: paymentError,
    });
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);