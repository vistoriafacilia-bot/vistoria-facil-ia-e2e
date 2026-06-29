import { randomUUID, timingSafeEqual } from 'node:crypto';

const REPORT_CREDIT_PLANS = {
  report_50_beta_4990: { priceCents: 4990, currency: 'BRL', analysisLimit: 50 },
  report_100_9990: { priceCents: 9990, currency: 'BRL', analysisLimit: 100 },
  report_150_14990: { priceCents: 14990, currency: 'BRL', analysisLimit: 150 },
};

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const json = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
});

const sanitizeError = (error) => {
  const message = String(error?.message || error || 'unknown error');
  if (/token|authorization|secret|password|key|access_token|api_key/i.test(message)) {
    return 'asaas_webhook_failed_sensitive';
  }
  return message.slice(0, 500);
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const getHeader = (headersMap, names) => {
  for (const name of names) {
    const value = headersMap[name] || headersMap[name.toLowerCase()] || headersMap[name.toUpperCase()];
    if (value) return value;
  }
  return '';
};

const validateWebhookToken = (event, expectedToken) => {
  const received =
    getHeader(event.headers || {}, ['asaas-access-token', 'Asaas-Access-Token'])
    || getHeader(event.headers || {}, ['x-asaas-webhook-token', 'X-Asaas-Webhook-Token'])
    || getHeader(event.headers || {}, ['access_token', 'Access-Token'])
    || String(getHeader(event.headers || {}, ['authorization', 'Authorization'])).replace(/^Bearer\s+/i, '');
  return Boolean(expectedToken && received && safeEqual(received, expectedToken));
};

const supabaseFetch = async ({ path, method = 'GET', body, supabaseUrl, serviceRoleKey }) => {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
};

const getEventType = (body) => String(body.event || body.type || body.action || '');

const getCheckoutId = (body) =>
  body.checkout?.id
  || body.checkoutId
  || body.checkout_id
  || body.payment?.checkout
  || body.payment?.checkoutId
  || body.id
  || null;

const getPaymentId = (body) =>
  body.payment?.id
  || body.paymentId
  || body.payment_id
  || body.charge?.id
  || getCheckoutId(body)
  || null;

const getExternalReference = (body) =>
  body.checkout?.externalReference
  || body.payment?.externalReference
  || body.charge?.externalReference
  || body.externalReference
  || null;

const toOrderStatus = (eventType) => {
  if (eventType === 'CHECKOUT_PAID') return 'approved';
  if (eventType === 'CHECKOUT_CANCELED') return 'cancelled';
  if (eventType === 'CHECKOUT_EXPIRED') return 'expired';
  return 'pending';
};

const createEventId = ({ body, eventType, checkoutId, paymentId, orderId }) => {
  const stableId = body.id || body.eventId || body.webhookEventId || `${eventType}_${checkoutId || paymentId || orderId}`;
  return `asaas_${stableId}`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 180);
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { supabaseUrl, serviceRoleKey, webhookToken } = env();
  if (!supabaseUrl || !serviceRoleKey || !webhookToken) {
    return json(503, { error: 'asaas_webhook_env_missing' });
  }
  if (!validateWebhookToken(event, webhookToken)) {
    return json(401, { error: 'invalid_asaas_webhook_token' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const eventType = getEventType(body);
    const checkoutId = getCheckoutId(body);
    const paymentId = getPaymentId(body);
    const orderId = getExternalReference(body);
    if (!eventType) return json(400, { error: 'asaas_event_missing' });
    if (!orderId && !checkoutId) return json(202, { status: 'ignored', reason: 'asaas_reference_missing' });

    const eventId = createEventId({ body, eventType, checkoutId, paymentId, orderId });
    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: 'mercadopago_webhook_events',
      method: 'POST',
      body: {
        id: eventId,
        event_type: `asaas:${eventType}`,
        payment_id: String(paymentId || checkoutId || orderId),
        status: eventType,
        processed: false,
        payload: body,
      },
    }).catch(async (error) => {
      if (!String(error?.message || error).includes('duplicate')) throw error;
    });

    const orderFilter = orderId
      ? `id=eq.${encodeURIComponent(orderId)}&limit=1`
      : `preference_id=eq.${encodeURIComponent(checkoutId)}&provider=eq.asaas&limit=1`;
    const orders = await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_payment_orders?${orderFilter}`,
    });
    const order = orders?.[0];
    if (!order || order.provider !== 'asaas') return json(202, { status: 'ignored', reason: 'asaas_order_not_found' });

    const orderStatus = toOrderStatus(eventType);
    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_payment_orders?id=eq.${encodeURIComponent(order.id)}`,
      method: 'PATCH',
      body: {
        status: orderStatus,
        payment_id: paymentId ? String(paymentId) : order.payment_id || null,
        preference_id: checkoutId || order.preference_id || null,
        raw_status: eventType,
        updated_at: new Date().toISOString(),
      },
    });

    if (eventType !== 'CHECKOUT_PAID') {
      await supabaseFetch({
        supabaseUrl,
        serviceRoleKey,
        path: `mercadopago_webhook_events?id=eq.${encodeURIComponent(eventId)}`,
        method: 'PATCH',
        body: { processed: true },
      });
      return json(200, { status: 'accepted_no_credit' });
    }

    const plan = REPORT_CREDIT_PLANS[order.plan_id];
    if (!plan || Number(order.amount_cents) !== plan.priceCents || order.currency !== plan.currency) {
      await supabaseFetch({
        supabaseUrl,
        serviceRoleKey,
        path: `mercadopago_webhook_events?id=eq.${encodeURIComponent(eventId)}`,
        method: 'PATCH',
        body: { processed: true },
      });
      return json(200, { status: 'accepted_no_credit' });
    }

    const existingCredits = await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_credits?order_id=eq.${encodeURIComponent(order.id)}&limit=1`,
    });
    if (!existingCredits?.length) {
      const nowIso = new Date().toISOString();
      await supabaseFetch({
        supabaseUrl,
        serviceRoleKey,
        path: 'report_credits',
        method: 'POST',
        body: {
          id: randomUUID(),
          user_id: order.user_id,
          plan_id: order.plan_id,
          order_id: order.id,
          payment_id: String(paymentId || checkoutId || `asaas_${order.id}`),
          preference_id: checkoutId || order.preference_id || null,
          status: 'available',
          analysis_limit: plan.analysisLimit,
          analysis_used: 0,
          price_cents: Number(order.amount_cents),
          currency: order.currency,
          created_at: nowIso,
          updated_at: nowIso,
        },
      });
    }

    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `mercadopago_webhook_events?id=eq.${encodeURIComponent(eventId)}`,
      method: 'PATCH',
      body: { processed: true },
    });

    return json(200, { status: 'credit_available' });
  } catch (error) {
    return json(500, {
      error: 'asaas_webhook_failed',
      message: sanitizeError(error),
    });
  }
}
