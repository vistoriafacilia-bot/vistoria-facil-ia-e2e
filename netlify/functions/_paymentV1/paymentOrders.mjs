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
  let response;
  try {
    response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
      method,
      headers: jsonHeaders(config),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new PaymentV1Error('Payment V1 database request failed.', {
      debugCode,
      statusCode: 500,
      details: sanitizeForPaymentLog(error?.message || String(error)),
    });
  }

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

const requireStatusUserId = (userId) => {
  if (!userId) {
    throw new PaymentV1Error('Payment V1 status requires user_id.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
    });
  }
};

export const createPaymentOrderStore = ({ env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'order_create_failed',
      statusCode: 500,
    });
  }
  const config = resolveSupabasePaymentConfig(env);

  const createPendingOrder = async ({ plan, externalReference, userId }) => {
    if (!userId) {
      throw new PaymentV1Error('Payment V1 order requires user_id.', {
        debugCode: 'invalid_auth_token',
        statusCode: 401,
      });
    }
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

  const findOrderForWebhook = async ({ externalReference, checkoutId, paymentId }) => {
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
    if ((!rows || rows.length === 0) && paymentId && paymentId !== checkoutId) {
      rows = await requestSupabase({
        config,
        fetchImpl,
        path: `payment_v1_orders?provider_checkout_id=eq.${encodeURIComponent(paymentId)}&limit=1&select=*`,
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
        debugCode: 'webhook_event_record_failed',
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
    if (!order?.user_id) {
      throw new PaymentV1Error('Payment V1 credit requires order user_id.', {
        debugCode: 'credit_create_failed',
        statusCode: 500,
      });
    }
    try {
      const rows = await requestSupabase({
        config,
        fetchImpl,
        path: 'payment_v1_credits?select=*',
        method: 'POST',
        body: {
          user_id: order.user_id,
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

  const listActiveCreditsForUser = async ({ userId }) => {
    requireStatusUserId(userId);
    const rows = await requestSupabase({
      config,
      fetchImpl,
      path: `payment_v1_credits?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&order=created_at.desc&select=id,order_id,plan_code,analysis_limit,analysis_used,status,created_at,finalized_at`,
      debugCode: 'credits_query_failed',
    });
    return Array.isArray(rows) ? rows : [];
  };

  const listRecentCreditsForUser = async ({ userId }) => {
    requireStatusUserId(userId);
    const rows = await requestSupabase({
      config,
      fetchImpl,
      path: `payment_v1_credits?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20&select=id,order_id,plan_code,analysis_limit,analysis_used,status,created_at,finalized_at`,
      debugCode: 'credits_query_failed',
    });
    return Array.isArray(rows) ? rows : [];
  };

  const listRecentOrdersForUser = async ({ userId }) => {
    requireStatusUserId(userId);
    const rows = await requestSupabase({
      config,
      fetchImpl,
      path: `payment_v1_orders?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20&select=id,plan_code,provider_checkout_id,checkout_url,external_reference,status,amount_cents,analysis_limit,paid_at,created_at,updated_at`,
      debugCode: 'orders_query_failed',
    });
    return Array.isArray(rows) ? rows : [];
  };

  const listRecentEventsForOrders = async ({ orders = [] }) => {
    const seen = new Map();
    const orderKeys = orders.flatMap((order) => [
      { column: 'external_reference', value: order.external_reference },
      { column: 'provider_checkout_id', value: order.provider_checkout_id },
    ]).filter((item) => item.value);

    for (const { column, value } of orderKeys) {
      const rows = await requestSupabase({
        config,
        fetchImpl,
        path: `payment_v1_events?${column}=eq.${encodeURIComponent(value)}&order=created_at.desc&limit=20&select=id,provider,event_id,event_type,provider_checkout_id,external_reference,processed_at,created_at`,
        debugCode: 'events_query_failed',
      });
      for (const row of Array.isArray(rows) ? rows : []) {
        seen.set(row.id || `${row.provider}:${row.event_id}`, row);
      }
    }

    return [...seen.values()].sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || ''))).slice(0, 20);
  };

  const getPaymentStatusForUser = async ({ userId }) => {
    const activeCredits = await listActiveCreditsForUser({ userId });
    const recentOrders = await listRecentOrdersForUser({ userId });
    return {
      activeCredits,
      pendingOrders: recentOrders.filter((order) => order.status === 'pending'),
      paidOrders: recentOrders.filter((order) => order.status === 'paid'),
    };
  };

  return {
    createPendingOrder,
    updateOrderCheckout,
    findOrderForWebhook,
    recordWebhookEvent,
    updateOrderStatus,
    createCreditForOrderOnce,
    listActiveCreditsForUser,
    listRecentCreditsForUser,
    listRecentOrdersForUser,
    listRecentEventsForOrders,
    getPaymentStatusForUser,
  };
};
