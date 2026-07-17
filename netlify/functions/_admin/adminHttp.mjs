import crypto from 'node:crypto';
import { authenticateAdminRequest } from './adminAuth.mjs';
import { errorResponseBody, json, sanitizeForAdminLog, toAdminError } from './adminErrors.mjs';
import { createAdminStore } from './adminStore.mjs';

const parseQuery = (event = {}) => event.queryStringParameters || {};

const safeLog = (level, payload) => {
  const line = JSON.stringify(sanitizeForAdminLog(payload));
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
};

const resolvePermission = (permission, event) => {
  if (typeof permission === 'function') return permission(event);
  if (permission && typeof permission === 'object') return permission[event.httpMethod || 'GET'] || permission.default || null;
  return permission || null;
};

export const createAdminHandler = ({
  allowedMethods = ['GET'],
  permission = null,
  storeFactory = createAdminStore,
  authenticateRequest = authenticateAdminRequest,
  env = process.env,
  handle,
}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  const method = event.httpMethod || 'GET';
  try {
    if (!allowedMethods.includes(method)) {
      return json(405, {
        error: 'Method not allowed.',
        debugCode: 'admin_method_not_allowed',
        requestId,
      });
    }

    const store = storeFactory({ env });
    const requiredPermission = resolvePermission(permission, event);
    const auth = await authenticateRequest({
      event,
      env,
      requiredPermission,
      adminStore: store,
    });
    const body = store.parseJsonBody(event.body);
    const result = await handle({
      event,
      method,
      body,
      query: parseQuery(event),
      store,
      auth,
      requestId,
    });
    return json(200, {
      ...result,
      requestId,
    });
  } catch (error) {
    const adminError = toAdminError(error);
    safeLog('error', {
      scope: 'admin-v1',
      requestId,
      debugCode: adminError.debugCode,
      statusCode: adminError.statusCode,
      error: adminError,
    });
    return json(adminError.statusCode || 500, errorResponseBody(adminError, requestId));
  }
};
