import { randomUUID } from 'node:crypto';

const MP_PREFERENCES_URL = 'https://api.mercadopago.com/checkout/preferences';

const REPORT_CREDIT_PLANS = {
  report_50_beta_4990: {
    name: 'Relatorio 50',
    description: 'Credito avulso para 1 relatorio com ate 50 analises de IA.',
    priceCents: 4990,
    currency: 'BRL',
    analysisLimit: 50,
  },
  report_100_9990: {
    name: 'Relatorio 100',
    description: 'Credito avulso para 1 relatorio com ate 100 analises de IA.',
    priceCents: 9990,
    currency: 'BRL',
    analysisLimit: 100,
  },
  report_150_14990: {
    name: 'Relatorio 150',
    description: 'Credito avulso para 1 relatorio com ate 150 analises de IA.',
    priceCents: 14990,
    currency: 'BRL',
    analysisLimit: 150,
  },
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

const requiredEnv = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const mpEnv = String(process.env.MERCADOPAGO_ENV || 'production').trim().toLowerCase();
  return { supabaseUrl, serviceRoleKey, mpToken, mpEnv };
};

const isMercadoPagoSandbox = (mpEnv) => mpEnv === 'sandbox' || mpEnv === 'test';

const isTrustedEmail = (email) => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const sanitizeError = (error) => {
  const message = String(error?.message || error || 'unknown error');
  if (/token|authorization|secret|password|key/i.test(message)) {
    return 'payment_checkout_failed_sensitive';
  }
  return message.slice(0, 500);
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

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { supabaseUrl, serviceRoleKey, mpToken, mpEnv } = requiredEnv();
  if (!supabaseUrl || !serviceRoleKey || !mpToken) {
    return json(503, { error: 'payment_env_missing' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const planId = String(payload.planId || '');
    const plan = REPORT_CREDIT_PLANS[planId];
    if (!plan) return json(400, { error: 'plan_not_allowed' });

    const user = await getAuthenticatedUser({
      supabaseUrl,
      serviceRoleKey,
      authorization: event.headers.authorization || event.headers.Authorization,
    });

    const origin = String(event.headers.origin || event.headers.Origin || process.env.URL || '').replace(/\/$/, '');
    if (!origin) return json(400, { error: 'origin_required' });

    const functionBaseUrl = String(process.env.URL || origin).replace(/\/$/, '');
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
        plan_id: planId,
        status: 'created',
        amount_cents: plan.priceCents,
        currency: plan.currency,
        provider: 'mercado_pago',
        created_at: nowIso,
        updated_at: nowIso,
      },
    });

    const preferencePayload = {
      items: [{
        id: planId,
        title: plan.name,
        description: plan.description,
        quantity: 1,
        currency_id: plan.currency,
        unit_price: plan.priceCents / 100,
      }],
      external_reference: orderId,
      metadata: {
        order_id: orderId,
        user_id: user.id,
        plan_id: planId,
        product_type: 'report_credit',
      },
      notification_url: `${functionBaseUrl}/.netlify/functions/mercadopago-webhook`,
      back_urls: {
        success: `${origin}/?payment_status=success&order_id=${encodeURIComponent(orderId)}`,
        pending: `${origin}/?payment_status=pending&order_id=${encodeURIComponent(orderId)}`,
        failure: `${origin}/?payment_status=failure&order_id=${encodeURIComponent(orderId)}`,
      },
      auto_return: 'approved',
    };

    if (isTrustedEmail(user.email)) {
      preferencePayload.payer = { email: user.email };
    }

    const preferenceResponse = await fetch(MP_PREFERENCES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    const preference = await preferenceResponse.json().catch(() => ({}));
    const useSandboxUrl = isMercadoPagoSandbox(mpEnv);
    const checkoutUrl = useSandboxUrl ? preference?.sandbox_init_point : preference?.init_point;
    const checkoutUrlError = useSandboxUrl
      ? 'mercadopago_sandbox_init_point_missing'
      : 'mercadopago_init_point_missing';

    if (!preferenceResponse.ok || !preference?.id || !checkoutUrl) {
      await supabaseFetch({
        supabaseUrl,
        serviceRoleKey,
        path: `report_payment_orders?id=eq.${encodeURIComponent(orderId)}`,
        method: 'PATCH',
        body: {
          status: 'error',
          raw_status: `preference_error_${preferenceResponse.status}_${checkoutUrlError}`,
          updated_at: new Date().toISOString(),
        },
      });
      return json(502, { error: checkoutUrlError });
    }

    await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `report_payment_orders?id=eq.${encodeURIComponent(orderId)}`,
      method: 'PATCH',
      body: {
        status: 'pending',
        preference_id: preference.id,
        checkout_url: checkoutUrl,
        updated_at: new Date().toISOString(),
      },
    });

    return json(200, {
      orderId,
      preferenceId: preference.id,
      checkoutUrl,
    });
  } catch (error) {
    return json(500, {
      error: 'create_report_checkout_failed',
      message: sanitizeError(error),
    });
  }
}
