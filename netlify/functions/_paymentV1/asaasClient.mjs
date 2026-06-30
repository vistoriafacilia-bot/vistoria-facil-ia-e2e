import { PaymentV1Error, sanitizeForPaymentLog } from './paymentErrors.mjs';

export const ASAAS_BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
};

export const ASAAS_CHECKOUT_BASE_URLS = {
  sandbox: 'https://sandbox.asaas.com/checkoutSession/show',
  production: 'https://asaas.com/checkoutSession/show',
};

export const resolveAsaasConfig = (env = process.env, { requireCallback = true } = {}) => {
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
  if (requireCallback && (!env.ASAAS_SUCCESS_URL || !env.ASAAS_CANCEL_URL || !env.ASAAS_EXPIRED_URL)) {
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

export const buildAsaasCheckoutPayload = ({ plan, config, externalReference, now = Date.now }) => ({
  billingTypes: ['PIX', 'CREDIT_CARD'],
  chargeTypes: ['DETACHED'],
  externalReference: externalReference || `vf-payment-v1-${plan.code}-${now()}`,
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

const debugCodeForAsaasStatus = (status) => {
  if (status === 400) return 'asaas_400';
  if (status === 401 || status === 403) return 'asaas_401';
  return 'asaas_request_failed';
};

const parseAsaasJson = async (response) => {
  const responseText = await response.text();
  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    return { raw: responseText };
  }
};

const requestAsaasJson = async ({ config, fetchImpl, path, debugCode = 'asaas_request_failed', allowLookupMiss = false }) => {
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        access_token: config.apiKey,
      },
    });
  } catch (error) {
    throw new PaymentV1Error('Asaas lookup request failed.', {
      debugCode,
      statusCode: 502,
      details: sanitizeForPaymentLog(error?.message || String(error)),
    });
  }

  const body = await parseAsaasJson(response);
  if (!response.ok) {
    if (allowLookupMiss && [400, 404, 405].includes(response.status)) {
      return {
        missed: true,
        asaasStatus: response.status,
        body: sanitizeForPaymentLog(body),
      };
    }
    throw new PaymentV1Error('Asaas lookup request failed.', {
      debugCode: debugCodeForAsaasStatus(response.status),
      statusCode: response.status >= 400 && response.status < 500 ? 400 : 502,
      asaasStatus: response.status,
      details: sanitizeForPaymentLog(body),
    });
  }

  return {
    missed: false,
    asaasStatus: response.status,
    body,
  };
};

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();

const PAID_ASAAS_STATUSES = new Set([
  'APPROVED',
  'PAID',
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
  'CHECKOUT_PAID',
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
]);

const extractAsaasPaymentCandidates = (body = {}) => {
  const values = [];
  const push = (item) => {
    if (item && typeof item === 'object') values.push(item);
  };
  push(body);
  push(body.payment);
  push(body.checkout);
  push(body.object);
  push(body.object?.payment);
  push(body.object?.checkout);
  for (const item of Array.isArray(body.data) ? body.data : []) push(item);
  for (const item of Array.isArray(body.payments) ? body.payments : []) push(item);
  for (const item of Array.isArray(body.items) ? body.items : []) push(item);
  for (const item of Array.isArray(body.checkout?.payments) ? body.checkout.payments : []) push(item);
  return values;
};

const paymentMatchesOrder = ({ payment = {}, checkoutId, externalReference }) => {
  const paymentExternalReference = payment.externalReference || payment.external_reference || payment.checkout?.externalReference || payment.checkout?.external_reference || null;
  const paymentCheckoutId = payment.checkoutId || payment.checkout_id || payment.checkout?.id || payment.checkoutSessionId || payment.checkout_session_id || null;
  if (externalReference && paymentExternalReference === externalReference) return true;
  if (checkoutId && paymentCheckoutId === checkoutId) return true;
  if (checkoutId && payment.id === checkoutId) return true;
  return false;
};

const paymentLooksPaid = (payment = {}) => {
  const statuses = [
    payment.status,
    payment.paymentStatus,
    payment.checkoutStatus,
    payment.event,
    payment.type,
    payment.action,
    payment.payment?.status,
    payment.checkout?.status,
  ].map(normalizeStatus).filter(Boolean);
  return statuses.some((status) => PAID_ASAAS_STATUSES.has(status));
};

export const getAsaasPaymentConfirmation = async ({ checkoutId, externalReference, env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  if (!checkoutId && !externalReference) {
    throw new PaymentV1Error('Asaas lookup requires checkoutId or externalReference.', {
      debugCode: 'asaas_lookup_missing_reference',
      statusCode: 500,
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'asaas_request_failed',
      statusCode: 500,
    });
  }

  const config = resolveAsaasConfig(env, { requireCallback: false });
  const attempts = [];
  const paths = [];
  if (checkoutId) paths.push({ path: `/checkouts/${encodeURIComponent(checkoutId)}`, matchedBy: 'checkout_id' });
  if (externalReference) paths.push({ path: `/payments?externalReference=${encodeURIComponent(externalReference)}`, matchedBy: 'external_reference' });
  if (checkoutId) {
    paths.push({ path: `/payments?checkoutId=${encodeURIComponent(checkoutId)}`, matchedBy: 'checkout_id' });
    paths.push({ path: `/payments?checkout=${encodeURIComponent(checkoutId)}`, matchedBy: 'checkout_id' });
  }

  for (const { path, matchedBy } of paths) {
    const lookup = await requestAsaasJson({
      config,
      fetchImpl,
      path,
      debugCode: 'asaas_lookup_failed',
      allowLookupMiss: true,
    });
    const responseKeys = lookup.body && typeof lookup.body === 'object' && !Array.isArray(lookup.body)
      ? Object.keys(lookup.body)
      : [];
    attempts.push({
      path: path.replace(/=.*/, '=[redacted]'),
      matchedBy,
      missed: lookup.missed,
      asaasStatus: lookup.asaasStatus,
      responseKeys,
    });
    if (lookup.missed) continue;

    const candidates = extractAsaasPaymentCandidates(lookup.body);
    const paidCandidate = candidates.find((candidate) => paymentMatchesOrder({ payment: candidate, checkoutId, externalReference }) && paymentLooksPaid(candidate));
    if (paidCandidate) {
      return {
        confirmed: true,
        matchedBy,
        status: normalizeStatus(paidCandidate.status || paidCandidate.paymentStatus || paidCandidate.checkoutStatus || paidCandidate.event || paidCandidate.type),
        asaasStatus: lookup.asaasStatus,
        responseKeys,
        attempts,
      };
    }

    const lookupBodyMatchesCheckout = matchedBy === 'checkout_id' && lookup.body?.id === checkoutId;
    const checkoutPaid = matchedBy === 'checkout_id'
      && candidates.some((candidate) => (
        paymentMatchesOrder({ payment: candidate, checkoutId, externalReference }) || lookupBodyMatchesCheckout
      ) && paymentLooksPaid(candidate.checkout || candidate));
    if (checkoutPaid) {
      return {
        confirmed: true,
        matchedBy,
        status: 'PAID',
        asaasStatus: lookup.asaasStatus,
        responseKeys,
        attempts,
      };
    }
  }

  return {
    confirmed: false,
    matchedBy: null,
    status: 'not_confirmed',
    attempts,
  };
};

export const createAsaasCheckout = async ({ plan, externalReference, env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) => {
  if (!plan) {
    throw new PaymentV1Error('Invalid Payment V1 plan.', {
      debugCode: 'payment_v1_invalid_plan',
      statusCode: 400,
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'asaas_request_failed',
      statusCode: 500,
    });
  }

  const config = resolveAsaasConfig(env);
  const payload = buildAsaasCheckoutPayload({ plan, config, externalReference, now });
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        access_token: config.apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new PaymentV1Error('Asaas checkout request failed.', {
      debugCode: 'asaas_request_failed',
      statusCode: 502,
      details: sanitizeForPaymentLog(error?.message || String(error)),
    });
  }

  const body = await parseAsaasJson(response);

  if (!response.ok) {
    throw new PaymentV1Error('Asaas checkout request failed.', {
      debugCode: debugCodeForAsaasStatus(response.status),
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
