const SAFE_ERROR_KEYS = new Set(['message', 'debugCode', 'asaasStatus', 'requestId']);

export class PaymentV1Error extends Error {
  constructor(message, { debugCode, statusCode = 500, asaasStatus = null, details = null } = {}) {
    super(message);
    this.name = 'PaymentV1Error';
    this.debugCode = debugCode || 'payment_v1_error';
    this.statusCode = statusCode;
    this.asaasStatus = asaasStatus;
    this.details = sanitizeForPaymentLog(details);
  }
}

export const sanitizeForPaymentLog = (value) => {
  const seen = new WeakSet();
  const walk = (input) => {
    if (input === null || input === undefined) return input;
    if (typeof input === 'string') {
      return input
        .replace(/(access[_-]?token|authorization|bearer|api[_-]?key|jwt|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, 1500);
    }
    if (typeof input !== 'object') return input;
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    if (Array.isArray(input)) return input.map(walk);
    return Object.fromEntries(Object.entries(input).map(([key, item]) => {
      if (/token|authorization|access|key|secret|cookie|jwt/i.test(key)) return [key, '[redacted]'];
      return [key, walk(item)];
    }));
  };
  return walk(value);
};

export const toPaymentV1Error = (error, fallbackDebugCode = 'payment_v1_unexpected_error') => {
  if (error instanceof PaymentV1Error) return error;
  return new PaymentV1Error('Payment V1 request failed.', {
    debugCode: error?.debugCode || fallbackDebugCode,
    statusCode: error?.statusCode || 500,
    asaasStatus: error?.asaasStatus || null,
    details: error?.details || error?.message || String(error),
  });
};

export const errorResponseBody = (error, requestId) => {
  const paymentError = toPaymentV1Error(error);
  const body = {
    error: paymentError.message || 'Payment V1 request failed.',
    debugCode: paymentError.debugCode || 'payment_v1_error',
    requestId,
  };
  if (paymentError.asaasStatus) body.asaasStatus = paymentError.asaasStatus;
  if (paymentError.details && typeof paymentError.details === 'object') {
    body.details = Object.fromEntries(Object.entries(paymentError.details).filter(([key]) => SAFE_ERROR_KEYS.has(key)));
  }
  return body;
};
