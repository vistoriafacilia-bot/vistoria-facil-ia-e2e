const SAFE_ERROR_KEYS = new Set(['message', 'debugCode', 'requestId', 'entityType', 'entityId']);

export class AdminError extends Error {
  constructor(message, { debugCode = 'admin_error', statusCode = 500, details = null } = {}) {
    super(message);
    this.name = 'AdminError';
    this.debugCode = debugCode;
    this.statusCode = statusCode;
    this.details = sanitizeForAdminLog(details);
  }
}

export const sanitizeForAdminLog = (value) => {
  const seen = new WeakSet();
  const walk = (input) => {
    if (input === null || input === undefined) return input;
    if (typeof input === 'string') {
      return input
        .replace(/(access[_-]?token|authorization|bearer|api[_-]?key|service[_-]?role|secret|jwt|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, 1500);
    }
    if (typeof input !== 'object') return input;
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    if (Array.isArray(input)) return input.map(walk);
    return Object.fromEntries(Object.entries(input).map(([key, item]) => {
      if (/token|authorization|access|key|secret|cookie|jwt|password/i.test(key)) return [key, '[redacted]'];
      return [key, walk(item)];
    }));
  };
  return walk(value);
};

export const toAdminError = (error, fallbackDebugCode = 'admin_unexpected_error') => {
  if (error instanceof AdminError) return error;
  return new AdminError('Admin request failed.', {
    debugCode: error?.debugCode || fallbackDebugCode,
    statusCode: error?.statusCode || 500,
    details: error?.details || error?.message || String(error),
  });
};

export const errorResponseBody = (error, requestId) => {
  const adminError = toAdminError(error);
  const body = {
    error: adminError.message || 'Admin request failed.',
    debugCode: adminError.debugCode || 'admin_error',
    requestId,
  };
  if (adminError.details && typeof adminError.details === 'object') {
    body.details = Object.fromEntries(Object.entries(adminError.details).filter(([key]) => SAFE_ERROR_KEYS.has(key)));
  }
  return body;
};

export const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});
