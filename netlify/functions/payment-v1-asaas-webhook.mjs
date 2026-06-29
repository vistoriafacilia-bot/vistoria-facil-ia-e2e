import crypto from 'node:crypto';
import { errorResponseBody, PaymentV1Error, sanitizeForPaymentLog, toPaymentV1Error } from './_paymentV1/paymentErrors.mjs';
import { createPaymentOrderStore } from './_paymentV1/paymentOrders.mjs';

const PAID_EVENTS = new Set(['CHECKOUT_PAID', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
const CANCELED_EVENTS = new Set(['CHECKOUT_CANCELED', 'PAYMENT_CANCELED', 'PAYMENT_REFUNDED', 'PAYMENT_REFUSED', 'PAYMENT_CHARGEBACK_REQUESTED']);
const EXPIRED_EVENTS = new Set(['CHECKOUT_EXPIRED', 'PAYMENT_OVERDUE']);

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

const lowerHeaders = (headers = {}) => Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));

export const getWebhookToken = (event = {}) => {
  const headers = lowerHeaders(event.headers || {});
  const authorization = String(headers.authorization || '');
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return String(headers['asaas-access-token'] || headers['x-asaas-webhook-token'] || headers['x-webhook-token'] || '').trim();
};

export const parseWebhookPayload = (event = {}) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    throw new PaymentV1Error('Invalid webhook JSON body.', {
      debugCode: 'unexpected_error',
      statusCode: 400,
    });
  }
};

export const extractAsaasWebhookFacts = (payload = {}) => {
  const eventType = String(payload.event || payload.type || payload.eventType || payload.action || '').trim().toUpperCase();
  const checkout = payload.checkout || payload.checkoutSession || payload.object?.checkout || {};
  const payment = payload.payment || payload.object?.payment || payload.data || {};
  const checkoutId = checkout.id || payload.checkoutId || payload.checkout_id || payment.checkoutId || payment.checkout_id || payment.checkout?.id || null;
  const paymentId = payment.id || payload.paymentId || payload.payment_id || payload.object?.payment?.id || null;
  const externalReference = checkout.externalReference || checkout.external_reference || payload.externalReference || payload.external_reference || payment.externalReference || payment.external_reference || null;
  const deterministicId = `asaas:${eventType || 'UNKNOWN'}:${checkoutId || paymentId || 'no-provider-id'}:${externalReference || 'no-external-reference'}`;
  const fallbackHash = crypto.createHash('sha256').update(deterministicId).digest('hex').slice(0, 24);
  const eventId = payload.id || payload.eventId || payload.event_id || `${deterministicId}:${fallbackHash}`;
  return { eventType, checkoutId, paymentId, externalReference, eventId };
};

export const mapAsaasEventStatus = (eventType) => {
  if (PAID_EVENTS.has(eventType)) return 'paid';
  if (CANCELED_EVENTS.has(eventType)) return 'canceled';
  if (EXPIRED_EVENTS.has(eventType)) return 'expired';
  return 'ignored';
};

export const createHandler = ({ paymentOrders = null, env = process.env } = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  try {
    if (event.httpMethod && event.httpMethod !== 'POST') {
      throw new PaymentV1Error('Method not allowed.', {
        debugCode: 'payment_v1_method_not_allowed',
        statusCode: 405,
      });
    }

    const expectedToken = env.ASAAS_WEBHOOK_TOKEN;
    if (!expectedToken || getWebhookToken(event) !== expectedToken) {
      throw new PaymentV1Error('Invalid Asaas webhook token.', {
        debugCode: 'webhook_invalid_token',
        statusCode: 401,
      });
    }

    const orderStore = paymentOrders || createPaymentOrderStore();
    const payload = parseWebhookPayload(event);
    const facts = extractAsaasWebhookFacts(payload);
    const eventStatus = mapAsaasEventStatus(facts.eventType);
    const sanitizedPayload = sanitizeForPaymentLog(payload);
    const eventRecord = await orderStore.recordWebhookEvent({
      eventId: facts.eventId,
      eventType: facts.eventType,
      checkoutId: facts.checkoutId,
      externalReference: facts.externalReference,
      raw: sanitizedPayload,
    });

    if (eventRecord.duplicate) {
      return json(200, {
        status: 'duplicate',
        debugCode: 'webhook_event_duplicate',
        requestId,
      });
    }

    if (eventStatus === 'ignored') {
      return json(200, {
        status: 'ignored',
        eventType: facts.eventType,
        requestId,
      });
    }

    const order = await orderStore.findOrderForWebhook({
      externalReference: facts.externalReference,
      checkoutId: facts.checkoutId,
    });

    if (!order) {
      return json(200, {
        status: 'order_not_found',
        debugCode: 'webhook_order_not_found',
        requestId,
      });
    }

    if (eventStatus === 'paid') {
      if (!order.user_id) {
        throw new PaymentV1Error('Payment V1 order has no user_id.', {
          debugCode: 'credit_create_failed',
          statusCode: 500,
        });
      }
      const paidOrder = await orderStore.updateOrderStatus({ orderId: order.id, status: 'paid' });
      const creditResult = await orderStore.createCreditForOrderOnce({ order: paidOrder || order });
      return json(200, {
        status: 'paid',
        orderId: order.id,
        creditCreated: !creditResult.duplicate,
        requestId,
      });
    }

    await orderStore.updateOrderStatus({ orderId: order.id, status: eventStatus });
    return json(200, {
      status: eventStatus,
      orderId: order.id,
      creditCreated: false,
      requestId,
    });
  } catch (error) {
    const paymentError = toPaymentV1Error(error, 'unexpected_error');
    return json(paymentError.statusCode || 500, errorResponseBody(paymentError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
