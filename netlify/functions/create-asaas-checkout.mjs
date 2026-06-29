import { randomUUID } from 'node:crypto';

const ASAAS_CHECKOUT_PATH = '/v3/checkouts';

const PLAN_ALIASES = {
  report_50_beta: 'report_50_beta_4990',
  report_100: 'report_100_9990',
  report_150: 'report_150_14990',
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

const env = () => {
  const asaasEnv = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    asaasEnv,
    asaasApiKey: process.env.ASAAS_API_KEY,
    successUrl: process.env.ASAAS_SUCCESS_URL || process.env.URL,
    cancelUrl: process.env.ASAAS_CANCEL_URL || process.env.URL,
    expiredUrl: process.env.ASAAS_EXPIRED_URL || process.env.URL,
  };
};

const asaasBaseUrl = (asaasEnv) => {
  if (asaasEnv === 'production') return 'https://api.asaas.com';
  if (asaasEnv === 'sandbox') return 'https://api-sandbox.asaas.com';
  throw new Error('asaas_env_invalid');
};

const isValidAsaasEnv = (asaasEnv) => asaasEnv === 'sandbox' || asaasEnv === 'production';

const sanitizeError = (error) => {
  const message = String(error?.message || error || 'unknown error');
  if (/token|authorization|secret|password|key|access_token|api_key/i.test(message)) {
    return 'asaas_checkout_failed_sensitive';
  }
  return message.slice(0, 500);
};

const normalizePlanId = (planId) => PLAN_ALIASES[planId] || planId;

const isTrustedEmail = (email) => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const appendOrderParams = (url, status, orderId) => {
  if (!url) throw new Error(`ASAAS_${status.toUpperCase()}_URL_MISSING`);
  const nextUrl = new URL(url);
  nextUrl.searchParams.set('payment_status', status);
  nextUrl.searchParams.set('order_id', orderId);
  nextUrl.searchParams.set('provider', 'asaas');
  return nextUrl.toString();
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

const getAuthenticatedUser = async ({ supabaseUrl, serviceRoleKey, authorization }) => {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('AUTH_TOKEN_MISSING');

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) throw new Error('AUTH_USER_INVALID');
  return data;
};

const getReportPlan = async ({ planId, supabaseUrl, serviceRoleKey }) => {
  const rows = await supabaseFetch({
    supabaseUrl,
    serviceRoleKey,
    path: `report_credit_plans?id=eq.${encodeURIComponent(planId)}&active=eq.true&limit=1`,
  });
  const plan = rows?.[0];
  if (!plan) throw new Error('REPORT_CREDIT_PLAN_NOT_FOUND');
  return plan;
};

const getCheckoutUrl = (checkout) =>
  checkout?.url
  || checkout?.checkoutUrl
  || checkout?.checkout_url
  || checkout?.invoiceUrl
  || checkout?.paymentUrl
  || checkout?.link;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const {
    supabaseUrl,
    serviceRoleKey,
    asaasEnv,
    asaasApiKey,
    successUrl,
    cancelUrl,
    expiredUrl,
  } = env();

  if (!supabaseUrl || !serviceRoleKey || !asaasApiKey) {
    return json(503, { error: 'asaas_env_missing' });
  }
  if (!isValidAsaasEnv(asaasEnv)) {
    return json(503, { error: 'asaas_env_invalid' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const planId = normalizePlanId(String(payload.planId || ''));
    const user = await getAuthenticatedUser({
      supabaseUrl,
      serviceRoleKey,
      authorization: event.headers.authorization || event.headers.Authorization,
    });
    const plan = await getReportPlan({ planId, supabaseUrl, serviceRoleKey });

    const orderId = randomUUID();
    const nowIso = new Date().toISOString();
    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: 'report_payment_orders',
      method: 'POST',
      body: {
        id: orderId,
        user_id: user.id,
        plan_id: plan.id,
        status: 'pending',
        amount_cents: Number(plan.price_cents),
        currency: plan.currency || 'BRL',
        provider: 'asaas',
        created_at: nowIso,
        updated_at: nowIso,
      },
    });

    const checkoutPayload = {
      billingTypes: ['PIX', 'CREDIT_CARD'],
      chargeTypes: ['DETACHED'],
      minutesToExpire: 120,
      externalReference: orderId,
      items: [{
        name: plan.name,
        description: plan.description,
        quantity: 1,
        value: Number(plan.price_cents) / 100,
      }],
      callback: {
        successUrl: appendOrderParams(successUrl, 'success', orderId),
        cancelUrl: appendOrderParams(cancelUrl, 'cancel', orderId),
        expiredUrl: appendOrderParams(expiredUrl, 'expired', orderId),
      },
    };

    if (isTrustedEmail(user.email)) {
      checkoutPayload.customerData = { email: user.email };
    }

    const asaasResponse = await fetch(`${asaasBaseUrl(asaasEnv)}${ASAAS_CHECKOUT_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: asaasApiKey,
      },
      body: JSON.stringify(checkoutPayload),
    });
    const checkout = await asaasResponse.json().catch(() => ({}));
    const checkoutUrl = getCheckoutUrl(checkout);
    const providerCheckoutId = checkout?.id || checkout?.checkoutId || checkout?.object || null;

    if (!asaasResponse.ok || !checkoutUrl) {
      await supabaseFetch({
        supabaseUrl,
        serviceRoleKey,
        path: `report_payment_orders?id=eq.${encodeURIComponent(orderId)}`,
        method: 'PATCH',
        body: {
          status: 'error',
          raw_status: `asaas_checkout_error_${asaasResponse.status}`,
          updated_at: new Date().toISOString(),
        },
      });
      return json(502, { error: 'asaas_checkout_failed' });
    }

    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_payment_orders?id=eq.${encodeURIComponent(orderId)}`,
      method: 'PATCH',
      body: {
        status: 'pending',
        preference_id: providerCheckoutId,
        checkout_url: checkoutUrl,
        raw_status: 'CHECKOUT_CREATED',
        updated_at: new Date().toISOString(),
      },
    });

    return json(200, {
      orderId,
      provider: 'asaas',
      providerCheckoutId,
      checkoutUrl,
    });
  } catch (error) {
    return json(500, {
      error: 'create_asaas_checkout_failed',
      message: sanitizeError(error),
    });
  }
}
