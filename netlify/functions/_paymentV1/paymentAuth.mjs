import { PaymentV1Error, sanitizeForPaymentLog } from './paymentErrors.mjs';

const lowerHeaders = (headers = {}) => Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));

export const getBearerTokenFromEvent = (event = {}) => {
  const authorization = String(lowerHeaders(event.headers || {}).authorization || '').trim();
  if (!authorization) {
    throw new PaymentV1Error('Authorization header is required.', {
      debugCode: 'missing_auth_header',
      statusCode: 401,
    });
  }
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    throw new PaymentV1Error('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
    });
  }
  const token = authorization.slice(7).trim();
  if (!token) {
    throw new PaymentV1Error('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
    });
  }
  return token;
};

export const resolveSupabaseAuthConfig = (env = process.env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new PaymentV1Error('Supabase Auth configuration is missing.', {
      debugCode: 'invalid_auth_token',
      statusCode: 500,
    });
  }
  return {
    url: String(env.SUPABASE_URL).replace(/\/$/, ''),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
};

export const verifySupabaseAccessToken = async ({ accessToken, env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  if (!accessToken) {
    throw new PaymentV1Error('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'invalid_auth_token',
      statusCode: 500,
    });
  }
  const config = resolveSupabaseAuthConfig(env);
  const response = await fetchImpl(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || !body?.id) {
    throw new PaymentV1Error('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
      details: sanitizeForPaymentLog(body),
    });
  }
  return {
    userId: body.id,
    email: body.email || null,
  };
};

export const authenticatePaymentV1Request = async ({ event, env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  const accessToken = getBearerTokenFromEvent(event);
  return verifySupabaseAccessToken({ accessToken, env, fetchImpl });
};
