import { AdminError, sanitizeForAdminLog } from './adminErrors.mjs';
import { createAdminRestClient, encodeFilterValue, resolveAdminSupabaseConfig } from './adminSupabase.mjs';

export const ADMIN_ROLES = ['owner', 'operation', 'support', 'finance', 'read_only'];

const ROLE_PERMISSIONS = {
  owner: ['*'],
  operation: [
    'dashboard.read',
    'customers.read',
    'customers.write',
    'plans.read',
    'trial.read',
    'trial.write',
    'orders.read',
    'orders.reprocess',
    'credits.read',
    'credits.write',
    'inspections.read',
    'admin_users.read',
    'audit.read',
  ],
  support: [
    'dashboard.read',
    'customers.read',
    'customers.write',
    'plans.read',
    'trial.read',
    'orders.read',
    'credits.read',
    'inspections.read',
    'audit.read',
  ],
  finance: [
    'dashboard.read',
    'customers.read',
    'plans.read',
    'plans.write',
    'orders.read',
    'orders.reprocess',
    'credits.read',
    'credits.write',
    'inspections.read',
    'audit.read',
  ],
  read_only: [
    'dashboard.read',
    'customers.read',
    'plans.read',
    'trial.read',
    'orders.read',
    'credits.read',
    'inspections.read',
    'admin_users.read',
    'audit.read',
  ],
};

const lowerHeaders = (headers = {}) => Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));

const normalizeAccessToken = (value) => {
  const token = String(value || '').trim();
  if (!token || token.toLowerCase() === 'null' || token.toLowerCase() === 'undefined') return '';
  if (token.toLowerCase().startsWith('bearer ')) return token.slice(7).trim();
  return token;
};

export const getBearerTokenFromEvent = (event = {}) => {
  const authorization = String(lowerHeaders(event.headers || {}).authorization || '').trim();
  if (!authorization) {
    throw new AdminError('Authorization header is required.', {
      debugCode: 'missing_auth_header',
      statusCode: 401,
    });
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AdminError('Authorization header format is invalid.', {
      debugCode: 'invalid_auth_header_format',
      statusCode: 401,
    });
  }
  const token = normalizeAccessToken(match[1]);
  if (!token) {
    throw new AdminError('Authorization header format is invalid.', {
      debugCode: 'invalid_auth_header_format',
      statusCode: 401,
    });
  }
  return token;
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export const verifySupabaseAccessToken = async ({ accessToken, env = process.env, fetchImpl = globalThis.fetch } = {}) => {
  const token = normalizeAccessToken(accessToken);
  if (!token) {
    throw new AdminError('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new AdminError('Fetch implementation is not available.', {
      debugCode: 'supabase_auth_get_user_failed',
      statusCode: 500,
    });
  }
  const config = resolveAdminSupabaseConfig(env);
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
    throw new AdminError('Supabase Auth getUser request failed.', {
      debugCode: 'supabase_auth_get_user_failed',
      statusCode: 502,
      details: sanitizeForAdminLog(error?.message || String(error)),
    });
  }

  const body = await parseJsonResponse(response);
  if (!response.ok || !body?.id) {
    throw new AdminError('Authorization bearer token is invalid.', {
      debugCode: 'invalid_auth_token',
      statusCode: 401,
      details: sanitizeForAdminLog(body),
    });
  }
  return {
    userId: body.id,
    email: body.email || null,
  };
};

const normalizeRole = (role) => String(role || '').trim();

export const assertAdminPermission = (admin, permission) => {
  if (!permission) return;
  const role = normalizeRole(admin?.role);
  const permissions = ROLE_PERMISSIONS[role] || [];
  if (permissions.includes('*') || permissions.includes(permission)) return;
  throw new AdminError('Admin role is not allowed to perform this action.', {
    debugCode: 'admin_permission_denied',
    statusCode: 403,
    details: {
      role,
      permission,
    },
  });
};

const parseBootstrapEmails = (env = process.env) => new Set(
  String(env.ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const getBootstrapAdmin = ({ authUser, env }) => {
  const email = String(authUser?.email || '').trim().toLowerCase();
  if (!email || !parseBootstrapEmails(env).has(email)) return null;
  return {
    id: null,
    user_id: authUser.userId,
    email,
    display_name: email,
    role: 'owner',
    active: true,
    bootstrap: true,
  };
};

const findAdminUser = async ({ rest, authUser, env }) => {
  const rowsByUserId = await rest.select(
    'admin_users',
    `user_id=eq.${encodeFilterValue(authUser.userId)}&active=eq.true&limit=1&select=*`,
  );
  const byUserId = Array.isArray(rowsByUserId) ? rowsByUserId[0] : null;
  if (byUserId) return byUserId;

  const email = String(authUser.email || '').trim().toLowerCase();
  if (email) {
    const rowsByEmail = await rest.select(
      'admin_users',
      `email=eq.${encodeFilterValue(email)}&active=eq.true&limit=1&select=*`,
    );
    const byEmail = Array.isArray(rowsByEmail) ? rowsByEmail[0] : null;
    if (byEmail) return byEmail;
  }

  return getBootstrapAdmin({ authUser, env });
};

export const authenticateAdminRequest = async ({
  event,
  env = process.env,
  fetchImpl = globalThis.fetch,
  requiredPermission,
  adminStore = null,
} = {}) => {
  const accessToken = getBearerTokenFromEvent(event);
  const authUser = await verifySupabaseAccessToken({ accessToken, env, fetchImpl });
  const rest = adminStore?.rest || createAdminRestClient({ env, fetchImpl });
  const admin = await findAdminUser({ rest, authUser, env });
  if (!admin) {
    throw new AdminError('Authenticated user is not an active administrator.', {
      debugCode: 'admin_user_not_found',
      statusCode: 403,
    });
  }
  if (!ADMIN_ROLES.includes(normalizeRole(admin.role))) {
    throw new AdminError('Admin role is invalid.', {
      debugCode: 'admin_role_invalid',
      statusCode: 403,
    });
  }
  assertAdminPermission(admin, requiredPermission);
  return {
    admin,
    authUser,
    permission: requiredPermission,
  };
};
