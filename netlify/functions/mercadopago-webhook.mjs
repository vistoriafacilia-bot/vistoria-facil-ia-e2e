import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

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

const sanitizeError = (error) => {
  const message = String(error?.message || error || 'unknown error');
  if (/token|authorization|secret|password|key/i.test(message)) {
    return 'payment_webhook_failed_sensitive';
  }
  return message.slice(0, 500);
};

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  mpToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
});

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

const parseSignature = (signatureHeader) => {
  const parts = String(signatureHeader || '').split(',').map(part => part.trim());
  const values = {};
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) values[key] = value;
  }
  return values;
};

const verifyMercadoPagoSignature = ({ secret, signatureHeader, requestId, paymentId }) => {
  if (!secret) return true;
  const parsed = parseSignature(signatureHeader);
  if (!parsed.ts || !parsed.v1 || !requestId || !paymentId) return false;
  const manifest = `id:${paymentId};request-id:${requestId};ts:${parsed.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(parsed.v1);
  return left.length === right.length && timingSafeEqual(left, right);
};

const paymentStatusToOrderStatus = (status) => {
  if (status === 'approved') return 'approved';
  if (status === 'pending' || status === 'in_process') return 'pending';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'expired') return 'expired';
  if (status === 'refunded') return 'refunded';
  if (status === 'charged_back') return 'charged_back';
  return 'pending';
};

const shouldRevokeUnfinalizedCredit = (status) =>
  status === 'refunded'
  || status === 'charged_back'
  || status === 'cancelled'
  || status === 'canceled';

const centsFromAmount = (amount) => Math.round(Number(amount || 0) * 100);

const getPaymentId = (event, body) => {
  const params = event.queryStringParameters || {};
  return String(params['data.id'] || params.id || body?.data?.id || body?.id || body?.resource || '').replace(/^.*\//, '');
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { supabaseUrl, serviceRoleKey, mpToken, webhookSecret } = env();
  if (!supabaseUrl || !serviceRoleKey || !mpToken || !webhookSecret) {
    return json(503, { error: 'payment_env_missing' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const paymentId = getPaymentId(event, body);
    const eventType = String(body?.type || body?.action || event.queryStringParameters?.type || 'payment');
    if (!paymentId) return json(400, { error: 'payment_id_missing' });

    const requestId = event.headers['x-request-id'] || event.headers['X-Request-Id'];
    const signature = event.headers['x-signature'] || event.headers['X-Signature'];
    if (!verifyMercadoPagoSignature({ secret: webhookSecret, signatureHeader: signature, requestId, paymentId })) {
      return json(401, { error: 'invalid_webhook_signature' });
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${mpToken}`,
      },
    });
    const payment = await paymentResponse.json().catch(() => ({}));
    if (!paymentResponse.ok) {
      return json(502, { error: 'mercadopago_payment_read_failed' });
    }

    const orderId = String(payment.external_reference || payment.metadata?.order_id || '');
    if (!orderId) return json(202, { status: 'ignored', reason: 'order_reference_missing' });

    const eventId = `mp_${paymentId}_${eventType}_${payment.status || 'unknown'}`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 180);
    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: 'mercadopago_webhook_events',
      method: 'POST',
      body: {
        id: eventId,
        event_type: eventType,
        payment_id: String(paymentId),
        status: payment.status || null,
        processed: false,
        payload: body,
      },
    }).catch(async (error) => {
      if (!String(error?.message || error).includes('duplicate')) throw error;
    });

    const orders = await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_payment_orders?id=eq.${encodeURIComponent(orderId)}&limit=1`,
    });
    const order = orders?.[0];
    if (!order) return json(202, { status: 'ignored', reason: 'order_not_found' });

    const plan = REPORT_CREDIT_PLANS[order.plan_id];
    const paidCents = centsFromAmount(payment.transaction_amount);
    const orderPatch = {
      status: paymentStatusToOrderStatus(payment.status),
      payment_id: String(paymentId),
      raw_status: payment.status || null,
      updated_at: new Date().toISOString(),
    };

    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_payment_orders?id=eq.${encodeURIComponent(order.id)}`,
      method: 'PATCH',
      body: orderPatch,
    });

    if (shouldRevokeUnfinalizedCredit(payment.status)) {
      await supabaseFetch({
        supabaseUrl,
        serviceRoleKey,
        path: `report_credits?payment_id=eq.${encodeURIComponent(String(paymentId))}&status=neq.finalized`,
        method: 'PATCH',
        body: {
          status: payment.status === 'refunded' ? 'refunded' : 'canceled',
          updated_at: new Date().toISOString(),
        },
      });
    }

    if (
      payment.status !== 'approved'
      || !plan
      || paidCents !== Number(order.amount_cents)
      || payment.currency_id !== order.currency
      || String(payment.metadata?.plan_id || order.plan_id) !== order.plan_id
    ) {
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
      path: `report_credits?payment_id=eq.${encodeURIComponent(String(paymentId))}&limit=1`,
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
          payment_id: String(paymentId),
          preference_id: order.preference_id || null,
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
      error: 'mercadopago_webhook_failed',
      message: sanitizeError(error),
    });
  }
}
