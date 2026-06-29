import { PaymentV1Error, sanitizeForPaymentLog } from './paymentErrors.mjs';

export const ASAAS_BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
};

export const ASAAS_CHECKOUT_BASE_URLS = {
  sandbox: 'https://sandbox.asaas.com/checkoutSession/show',
  production: 'https://asaas.com/checkoutSession/show',
};

export const resolveAsaasConfig = (env = process.env) => {
  const asaasEnv = String(env.ASAAS_ENV || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ASAAS_BASE_URLS, asaasEnv)) {
    throw new PaymentV1Error('ASAAS_ENV must be sandbox or production.', {
      debugCode: 'asaas_env_invalid',
      statusCode: 500,
    });
  }
  if (!env.ASAAS_API_KEY) {
    throw new PaymentV1Error('ASAAS_API_KEY is required.', {
      debugCode: 'missing_asaas_api_key',
      statusCode: 500,
    });
  }
  if (!env.ASAAS_SUCCESS_URL || !env.ASAAS_CANCEL_URL || !env.ASAAS_EXPIRED_URL) {
    throw new PaymentV1Error('ASAAS callback URLs are required.', {
      debugCode: 'missing_callback_url',
      statusCode: 500,
    });
  }
  return {
    asaasEnv,
    baseUrl: ASAAS_BASE_URLS[asaasEnv],
    checkoutBaseUrl: ASAAS_CHECKOUT_BASE_URLS[asaasEnv],
    apiKey: env.ASAAS_API_KEY,
    callback: {
      successUrl: env.ASAAS_SUCCESS_URL,
      cancelUrl: env.ASAAS_CANCEL_URL,
      expiredUrl: env.ASAAS_EXPIRED_URL,
    },
  };
};

export const buildCheckoutFallbackUrl = (asaasEnv, checkoutId) => {
  if (!checkoutId) return null;
  const base = ASAAS_CHECKOUT_BASE_URLS[asaasEnv];
  return base ? `${base}/${encodeURIComponent(checkoutId)}` : null;
};

export const buildAsaasCheckoutPayload = ({ plan, config, now = Date.now }) => ({
  billingTypes: ['PIX', 'CREDIT_CARD'],
  chargeTypes: ['DETACHED'],
  externalReference: `vf-payment-v1-${plan.code}-${now()}`,
  callback: config.callback,
  items: [
    {
      name: plan.name,
      description: plan.description,
      value: plan.value,
      quantity: 1,
    },
  ],
});

export const createAsaasCheckout = async ({ plan, env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) => {
  if (!plan) {
    throw new PaymentV1Error('Invalid Payment V1 plan.', {
      debugCode: 'payment_v1_invalid_plan',
      statusCode: 400,
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'payment_v1_fetch_missing',
      statusCode: 500,
    });
  }

  const config = resolveAsaasConfig(env);
  const payload = buildAsaasCheckoutPayload({ plan, config, now });
  const response = await fetchImpl(`${config.baseUrl}/checkouts`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      access_token: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let body = {};
  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = { raw: responseText };
  }

  if (!response.ok) {
    throw new PaymentV1Error('Asaas checkout request failed.', {
      debugCode: 'asaas_checkout_request_failed',
      statusCode: response.status >= 400 && response.status < 500 ? 400 : 502,
      asaasStatus: response.status,
      details: sanitizeForPaymentLog(body),
    });
  }

  const checkoutId = body?.id || body?.checkout?.id || null;
  if (!checkoutId) {
    throw new PaymentV1Error('Asaas response did not include checkout id.', {
      debugCode: 'asaas_response_missing_id',
      statusCode: 502,
      asaasStatus: response.status,
      details: sanitizeForPaymentLog(body),
    });
  }

  const checkoutUrl = body?.link || body?.url || body?.checkoutUrl || body?.checkout?.link || body?.checkout?.url || buildCheckoutFallbackUrl(config.asaasEnv, checkoutId);

  return {
    checkoutUrl,
    checkoutId,
    planCode: plan.code,
    asaasEnv: config.asaasEnv,
    baseUrl: config.baseUrl,
    responseKeys: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [],
  };
};
