import { PaymentV1Error, sanitizeForPaymentLog } from './paymentErrors.mjs';

const jsonHeaders = (config) => ({
  apikey: config.serviceRoleKey,
  authorization: `Bearer ${config.serviceRoleKey}`,
  'content-type': 'application/json',
  prefer: 'return=representation',
});

const nowIso = () => new Date().toISOString();

export const amountCentsForPlan = (plan) => Math.round(Number(plan.value) * 100);

export const buildPaymentV1ExternalReference = ({ planCode, now = Date.now, random = Math.random }) => {
  const suffix = Math.floor(random() * 1_000_000).toString().padStart(6, '0');
  return `vf-payment-v1-${planCode}-${now()}-${suffix}`;
};

export const resolveSupabasePaymentConfig = (env = process.env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new PaymentV1Error('Supabase Payment V1 configuration is missing.', {
      debugCode: 'order_create_failed',
      statusCode: 500,
    });
  }
  return {
    url: String(env.SUPABASE_URL).replace(/\/$/, ''),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const requestSupabase = async ({ config, fetchImpl, path, method = 'GET', body, debugCode }) => {
  const response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
    method,
    headers: jsonHeaders(config),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new PaymentV1Error('Payment V1 database request failed.', {
      debugCode,
      statusCode: 500,
      details: sanitizeForPaymentLog(payload),
    });
    error.supabaseStatus = response.status;
    throw error;
  }
  return payload;
};

export const createPaymentOrderStore = ({ env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'order_create_failed',
      statusCode: 500,
    });
  }
  const config = resolveSupabasePaymentConfig(env);

  const createPendingOrder = async ({ plan, externalReference, userId = null }) => {
    const rows = await requestSupabase({
      config,
      fetchImpl,
      path: 'payment_v1_orders?select=*',
      method: 'POST',
      body: {
        user_id: userId,
        plan_code: plan.code,
        provider: 'asaas',
        external_reference: externalReference,
        status: 'pending',
        amount_cents: amountCentsForPlan(plan),
        analysis_limit: plan.analysisLimit,
      },
      debugCode: 'order_create_failed',
    });
    const order = Array.isArray(rows) ? rows[0] : rows;
    if (!order?.id) {
      throw new PaymentV1Error('Payment V1 order was not returned.', {
        debugCode: 'order_create_failed',
        statusCode: 500,
      });
    }
    return order;
  };

  const updateOrderCheckout = async ({ orderId, checkoutId, checkoutUrl }) => {
    const rows = await requestSupabase({
      config,
      fetchImpl,
      path: `payment_v1_orders?id=eq.${encodeURIComponent(orderId)}&select=*`,
      method: 'PATCH',
      body: {
        provider_checkout_id: checkoutId,
        checkout_url: checkoutUrl,
        updated_at: nowIso(),
      },
      debugCode: 'order_update_failed',
    });
    return Array.isArray(rows) ? rows[0] : rows;
  };

  const findOrderForWebhook = async ({ externalReference, checkoutId }) => {
    let rows = [];
    if (externalReference) {
      rows = await requestSupabase({
        config,
        fetchImpl,
        path: `payment_v1_orders?external_reference=eq.${encodeURIComponent(externalReference)}&limit=1&select=*`,
        debugCode: 'webhook_order_not_found',
      });
    }
    if ((!rows || rows.length === 0) && checkoutId) {
      rows = await requestSupabase({
        config,
        fetchImpl,
        path: `payment_v1_orders?provider_checkout_id=eq.${encodeURIComponent(checkoutId)}&limit=1&select=*`,
        debugCode: 'webhook_order_not_found',
      });
    }
    return Array.isArray(rows) ? rows[0] || null : rows || null;
  };

  const recordWebhookEvent = async ({ eventId, eventType, checkoutId, externalReference, raw }) => {
    try {
      const rows = await requestSupabase({
        config,
        fetchImpl,
        path: 'payment_v1_events?select=*',
        method: 'POST',
        body: {
          provider: 'asaas',
          event_id: eventId,
          event_type: eventType,
          provider_checkout_id: checkoutId,
          external_reference: externalReference,
          raw,
          processed_at: nowIso(),
        },
        debugCode: 'unexpected_error',
      });
      return { duplicate: false, event: Array.isArray(rows) ? rows[0] : rows };
    } catch (error) {
      if (error?.details?.code === '23505' || error?.details?.message?.includes?.('duplicate')) {
        return { duplicate: true, event: null };
      }
      throw error;
    }
  };

  const updateOrderStatus = async ({ orderId, status }) => {
    const body = { status, updated_at: nowIso() };
    if (status === 'paid') body.paid_at = nowIso();
    const rows = await requestSupabase({
      config,
      fetchImpl,
      path: `payment_v1_orders?id=eq.${encodeURIComponent(orderId)}&select=*`,
      method: 'PATCH',
      body,
      debugCode: 'order_update_failed',
    });
    return Array.isArray(rows) ? rows[0] : rows;
  };

  const createCreditForOrderOnce = async ({ order }) => {
    try {
      const rows = await requestSupabase({
        config,
        fetchImpl,
        path: 'payment_v1_credits?select=*',
        method: 'POST',
        body: {
          user_id: order.user_id || null,
          order_id: order.id,
          plan_code: order.plan_code,
          analysis_limit: order.analysis_limit,
          analysis_used: 0,
          status: 'active',
        },
        debugCode: 'credit_create_failed',
      });
      return { duplicate: false, credit: Array.isArray(rows) ? rows[0] : rows };
    } catch (error) {
      if (error?.details?.code === '23505' || error?.details?.message?.includes?.('duplicate')) {
        const rows = await requestSupabase({
          config,
          fetchImpl,
          path: `payment_v1_credits?order_id=eq.${encodeURIComponent(order.id)}&limit=1&select=*`,
          debugCode: 'credit_create_failed',
        });
        return { duplicate: true, credit: Array.isArray(rows) ? rows[0] || null : rows || null };
      }
      throw error;
    }
  };

  return {
    createPendingOrder,
    updateOrderCheckout,
    findOrderForWebhook,
    recordWebhookEvent,
    updateOrderStatus,
    createCreditForOrderOnce,
  };
};
