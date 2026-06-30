import { PaymentV1Error, sanitizeForPaymentLog } from './paymentErrors.mjs';

const lowerHeaders = (headers = {}) => Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));

const trimEnv = (value) => String(value || '').trim();

const normalizeAccessToken = (value) => {
  const token = String(value || '').trim();
  if (!token || token.toLowerCase() === 'null' || token.toLowerCase() === 'undefined') return '';
  if (token.toLowerCase().startsWith('bearer ')) return token.slice(7).trim();
  return token;
};

export const getBearerTokenFromEvent = (event = {}) => {
  const authorization = String(lowerHeaders(event.headers || {}).authorization || '').trim();
  if (!authorization) {
    throw new PaymentV1Error('Authorization header is required.', {
      debugCode: 'missing_auth_header',
      statusCode: 401,
    });
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new PaymentV1Error('Authorization header format is invalid.', {
      debugCode: 'invalid_auth_header_format',
      statusCode: 401,
    });
  }
  const token = normalizeAccessToken(match[1]);
  if (!token) {
    throw new PaymentV1Error('Authorization header format is invalid.', {
      debugCode: 'invalid_auth_header_format',
      statusCode: 401,
    });
  }
  return token;
};

export const resolveSupabaseAuthConfig = (env = process.env) => {
  const url = trimEnv(env.SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = trimEnv(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = trimEnv(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY);

  if (!url) {
    throw new PaymentV1Error('Supabase URL is missing.', {
      debugCode: 'missing_supabase_url',
      statusCode: 500,
    });
  }
  if (!serviceRoleKey) {
    throw new PaymentV1Error('Supabase service role key is missing.', {
      debugCode: 'missing_supabase_service_role_key',
      statusCode: 500,
    });
  }
  return {
    url,
    serviceRoleKey,
    authApiKey: anonKey || serviceRoleKey,
  };
};

export const verifySupabaseAccessToken = async ({ accessToken, env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  const token = normalizeAccessToken(accessToken);
  if (!token) {
    throw new PaymentV1Error('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new PaymentV1Error('Fetch implementation is not available.', {
      debugCode: 'supabase_auth_get_user_failed',
      statusCode: 500,
    });
  }
  const config = resolveSupabaseAuthConfig(env);
  let response;
  try {
    response = await fetchImpl(`${config.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: config.authApiKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw new PaymentV1Error('Supabase Auth getUser request failed.', {
      debugCode: 'supabase_auth_get_user_failed',
      statusCode: 502,
      details: sanitizeForPaymentLog(error?.message || String(error)),
    });
  }
  const text = await response.text().catch((error) => {
    throw new PaymentV1Error('Supabase Auth getUser response failed.', {
      debugCode: 'supabase_auth_get_user_failed',
      statusCode: 502,
      details: sanitizeForPaymentLog(error?.message || String(error)),
    });
  });
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const safeBody = sanitizeForPaymentLog(body);
    const bodyText = JSON.stringify(safeBody || {}).toLowerCase();
    const looksLikeApiConfigFailure = /api[_ -]?key|apikey|project[_ -]?api|service[_ -]?role/.test(bodyText);
    const debugCode = looksLikeApiConfigFailure || ![401, 403].includes(response.status)
      ? 'supabase_auth_get_user_failed'
      : 'invalid_auth_token';
    const error = new PaymentV1Error(
      debugCode === 'invalid_auth_token' ? 'Authorization bearer token is invalid.' : 'Supabase Auth getUser request failed.',
      {
        debugCode,
        statusCode: debugCode === 'invalid_auth_token' ? 401 : 502,
        details: safeBody,
      }
    );
    error.supabaseStatus = response.status;
    throw error;
  }

  if (!body?.id) {
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
