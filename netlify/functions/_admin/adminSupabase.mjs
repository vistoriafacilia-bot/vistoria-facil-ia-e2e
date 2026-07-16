import { AdminError, sanitizeForAdminLog } from './adminErrors.mjs';

const trimEnv = (value) => String(value || '').trim();

export const resolveAdminSupabaseConfig = (env = process.env) => {
  const url = trimEnv(env.SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = trimEnv(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = trimEnv(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY);

  if (!url) {
    throw new AdminError('Supabase URL is missing.', {
      debugCode: 'missing_supabase_url',
      statusCode: 500,
    });
  }
  if (!serviceRoleKey) {
    throw new AdminError('Supabase service role key is missing.', {
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

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const restHeaders = (config, prefer = 'return=representation') => ({
  apikey: config.serviceRoleKey,
  authorization: `Bearer ${config.serviceRoleKey}`,
  'content-type': 'application/json',
  prefer,
});

export const requestSupabaseRest = async ({
  config,
  fetchImpl,
  path,
  method = 'GET',
  body,
  debugCode = 'admin_database_request_failed',
  prefer = 'return=representation',
}) => {
  let response;
  try {
    response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
      method,
      headers: restHeaders(config, prefer),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new AdminError('Admin database request failed.', {
      debugCode,
      statusCode: 500,
      details: sanitizeForAdminLog(error?.message || String(error)),
    });
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const adminError = new AdminError('Admin database request failed.', {
      debugCode,
      statusCode: response.status >= 400 && response.status < 500 ? 400 : 500,
      details: sanitizeForAdminLog(payload),
    });
    adminError.supabaseStatus = response.status;
    throw adminError;
  }
  return payload;
};

export const encodeFilterValue = (value) => encodeURIComponent(String(value ?? ''));

export const createAdminRestClient = ({ env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new AdminError('Fetch implementation is not available.', {
      debugCode: 'admin_fetch_missing',
      statusCode: 500,
    });
  }
  const config = resolveAdminSupabaseConfig(env);

  const request = (args) => requestSupabaseRest({ config, fetchImpl, ...args });
  const select = (table, query = 'select=*') => request({ path: `${table}?${query}` });
  const insert = (table, body, query = 'select=*') => request({ path: `${table}?${query}`, method: 'POST', body });
  const patch = (table, query, body) => request({ path: `${table}?${query}`, method: 'PATCH', body });

  return {
    config,
    fetchImpl,
    request,
    select,
    insert,
    patch,
  };
};
