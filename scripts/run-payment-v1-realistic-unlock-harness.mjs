import assert from 'node:assert/strict';
import fs from 'node:fs';

const originalConsole = { ...console };
console.info = () => {};
console.warn = () => {};
console.error = () => {};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const ordersModule = await import('../netlify/functions/_paymentV1/paymentOrders.mjs');
const checkoutModule = await import('../netlify/functions/payment-v1-create-checkout.mjs');
const webhookModule = await import('../netlify/functions/payment-v1-asaas-webhook.mjs');
const statusModule = await import('../netlify/functions/payment-v1-status.mjs');
const debugStatusModule = await import('../netlify/functions/payment-v1-debug-status.mjs');

const USER_A = '00000000-0000-4000-8000-000000000001';
const WEBHOOK_TOKEN = 'test_webhook_token';

const paymentGateSource = fs.readFileSync('src/components/PaymentV1Gate.tsx', 'utf8');
const paymentServiceSource = fs.readFileSync('src/lib/services/paymentV1Service.ts', 'utf8');

const makeStore = () => {
  const state = { orders: [], events: [], credits: [] };
  return {
    state,
    async createPendingOrder({ plan, externalReference, userId }) {
      if (!userId) throw Object.assign(new Error('user_id required'), { debugCode: 'invalid_auth_token', statusCode: 401 });
      const order = {
        id: `order_${state.orders.length + 1}`,
        user_id: userId,
        plan_code: plan.code,
        provider: 'asaas',
        provider_checkout_id: null,
        checkout_url: null,
        external_reference: externalReference,
        status: 'pending',
        amount_cents: ordersModule.amountCentsForPlan(plan),
        analysis_limit: plan.analysisLimit,
        paid_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.orders.push(order);
      return order;
    },
    async updateOrderCheckout({ orderId, checkoutId, checkoutUrl }) {
      const order = state.orders.find((item) => item.id === orderId);
      Object.assign(order, { provider_checkout_id: checkoutId, checkout_url: checkoutUrl, updated_at: new Date().toISOString() });
      return order;
    },
    async findOrderForWebhook({ externalReference, checkoutId, paymentId }) {
      return state.orders.find((order) => (
        order.external_reference === externalReference ||
        order.provider_checkout_id === checkoutId ||
        order.provider_checkout_id === paymentId
      )) || null;
    },
    async recordWebhookEvent({ eventId, eventType, checkoutId, externalReference, raw }) {
      const existing = state.events.find((event) => event.event_id === eventId);
      if (existing) return { duplicate: true, event: existing };
      const event = {
        id: `evt_${state.events.length + 1}`,
        provider: 'asaas',
        event_id: eventId,
        event_type: eventType,
        provider_checkout_id: checkoutId,
        external_reference: externalReference,
        raw,
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      state.events.push(event);
      return { duplicate: false, event };
    },
    async updateOrderStatus({ orderId, status }) {
      const order = state.orders.find((item) => item.id === orderId);
      Object.assign(order, {
        status,
        paid_at: status === 'paid' ? new Date().toISOString() : order.paid_at,
        updated_at: new Date().toISOString(),
      });
      return order;
    },
    async createCreditForOrderOnce({ order }) {
      const existing = state.credits.find((credit) => credit.order_id === order.id);
      if (existing) return { duplicate: true, credit: existing };
      const credit = {
        id: `credit_${state.credits.length + 1}`,
        user_id: order.user_id,
        order_id: order.id,
        plan_code: order.plan_code,
        analysis_limit: order.analysis_limit,
        analysis_used: 0,
        status: 'active',
        created_at: new Date().toISOString(),
        finalized_at: null,
      };
      state.credits.push(credit);
      return { duplicate: false, credit };
    },
    async listRecentOrdersForUser({ userId }) {
      return state.orders.filter((order) => order.user_id === userId);
    },
    async listActiveCreditsForUser({ userId }) {
      return state.credits.filter((credit) => credit.user_id === userId && credit.status === 'active');
    },
    async listRecentCreditsForUser({ userId }) {
      return state.credits.filter((credit) => credit.user_id === userId);
    },
    async listRecentEventsForOrders({ orders }) {
      const externalReferences = new Set(orders.map((order) => order.external_reference).filter(Boolean));
      const checkoutIds = new Set(orders.map((order) => order.provider_checkout_id).filter(Boolean));
      return state.events.filter((event) => externalReferences.has(event.external_reference) || checkoutIds.has(event.provider_checkout_id));
    },
    async getPaymentStatusForUser({ userId }) {
      const orders = await this.listRecentOrdersForUser({ userId });
      return {
        activeCredits: await this.listActiveCreditsForUser({ userId }),
        pendingOrders: orders.filter((order) => order.status === 'pending'),
        paidOrders: orders.filter((order) => order.status === 'paid'),
      };
    },
  };
};

const parseBody = (response) => JSON.parse(response.body);

const createCheckout = async (store, userId = USER_A) => {
  const handler = checkoutModule.createHandler({
    paymentOrders: store,
    authenticateRequest: async () => ({ userId }),
    buildExternalReference: ({ planCode }) => `vf-payment-v1-${planCode}-realistic-${stateCounter(store)}`,
    asaasClient: {
      async createAsaasCheckout({ plan, externalReference }) {
        return {
          checkoutUrl: `https://sandbox.asaas.com/checkoutSession/show/chk_${stateCounter(store)}`,
          checkoutId: `chk_${stateCounter(store)}`,
          planCode: plan.code,
          externalReference,
        };
      },
    },
  });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode: 'report_50_beta' }) });
  assert.equal(response.statusCode, 200);
  return parseBody(response);
};

const stateCounter = (store) => store.state.orders.length + 1;

const webhookEvent = (payload) => ({
  httpMethod: 'POST',
  headers: { 'asaas-access-token': WEBHOOK_TOKEN },
  body: JSON.stringify(payload),
});

const runWebhook = async (store, payload) => {
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN } });
  const response = await handler(webhookEvent(payload));
  return { response, body: parseBody(response) };
};

const runPaidWebhookByExternalReference = async (store, order, eventId = 'evt_paid_by_external') => runWebhook(store, {
  id: eventId,
  event: 'CHECKOUT_PAID',
  checkout: {
    externalReference: order.external_reference,
  },
});

const runPaidWebhookByCheckoutId = async (store, order, eventId = 'evt_paid_by_checkout') => runWebhook(store, {
  id: eventId,
  event: 'PAYMENT_RECEIVED',
  checkout: {
    id: order.provider_checkout_id,
  },
});

const runPaidWebhookByPaymentId = async (store, order, eventId = 'evt_paid_by_payment') => runWebhook(store, {
  id: eventId,
  event: 'PAYMENT_CONFIRMED',
  payment: {
    id: order.provider_checkout_id,
  },
});

const getStatus = async (store, userId = USER_A) => {
  const handler = statusModule.createHandler({ paymentOrders: store, authenticateRequest: async () => ({ userId }) });
  const response = await handler({ httpMethod: 'GET' });
  return { response, body: parseBody(response) };
};

const getDebugStatus = async (store, userId = USER_A) => {
  const handler = debugStatusModule.createHandler({ paymentOrders: store, authenticateRequest: async () => ({ userId }) });
  const response = await handler({ httpMethod: 'GET' });
  return { response, body: parseBody(response) };
};

test('checkoutCreatesOrderWithExternalReference', async () => {
  const store = makeStore();
  const body = await createCheckout(store);
  assert.equal(store.state.orders.length, 1);
  assert.equal(store.state.orders[0].status, 'pending');
  assert.equal(store.state.orders[0].user_id, USER_A);
  assert.equal(body.orderId, store.state.orders[0].id);
  assert.equal(body.externalReference, store.state.orders[0].external_reference);
  assert.match(body.externalReference, /^vf-payment-v1-report_50_beta-realistic-/);
});

test('webhookPaidFindsOrderByExternalReference', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { response, body } = await runPaidWebhookByExternalReference(store, store.state.orders[0]);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'paid');
  assert.equal(body.orderId, 'order_1');
});

test('webhookPaidFindsOrderByCheckoutId', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { response, body } = await runPaidWebhookByCheckoutId(store, store.state.orders[0]);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'paid');
  assert.equal(body.orderId, 'order_1');
});

test('webhookPaidFindsOrderByPaymentId', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { response, body } = await runPaidWebhookByPaymentId(store, store.state.orders[0]);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'paid');
  assert.equal(body.orderId, 'order_1');
});

test('webhookPaidMarksOrderPaid', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhookByExternalReference(store, store.state.orders[0]);
  assert.equal(store.state.orders[0].status, 'paid');
  assert.ok(store.state.orders[0].paid_at);
});

test('webhookPaidCreatesActiveCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhookByExternalReference(store, store.state.orders[0]);
  assert.equal(store.state.credits.length, 1);
  assert.equal(store.state.credits[0].status, 'active');
  assert.equal(store.state.credits[0].analysis_limit, 50);
});

test('statusShowsActiveCreditAfterWebhook', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhookByExternalReference(store, store.state.orders[0]);
  const { response, body } = await getStatus(store);
  assert.equal(response.statusCode, 200);
  assert.equal(body.hasActiveCredit, true);
  assert.equal(body.activeCredits.length, 1);
  assert.equal(body.paidOrders.length, 1);
});

test('debugStatusIdentifiesNoOrder', async () => {
  const { response, body } = await getDebugStatus(makeStore());
  assert.equal(response.statusCode, 200);
  assert.equal(body.counts.ordersCount, 0);
  assert.equal(body.counts.activeCreditsCount, 0);
});

test('debugStatusIdentifiesPendingNoEvent', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { body } = await getDebugStatus(store);
  assert.equal(body.counts.pendingOrdersCount, 1);
  assert.equal(body.counts.eventsCount, 0);
});

test('debugStatusIdentifiesPaidNoCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  await store.updateOrderStatus({ orderId: 'order_1', status: 'paid' });
  const { body } = await getDebugStatus(store);
  assert.equal(body.counts.paidOrdersCount, 1);
  assert.equal(body.counts.activeCreditsCount, 0);
});

test('debugStatusIdentifiesActiveCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhookByExternalReference(store, store.state.orders[0]);
  const { body } = await getDebugStatus(store);
  assert.equal(body.counts.activeCreditsCount, 1);
  assert.equal(body.latestCredits[0].status, 'active');
});

test('uiCanRefreshAndUnlockAfterCredit', () => {
  assert.match(paymentGateSource, /Verificar pagamento/);
  assert.match(paymentGateSource, /getPaymentV1DebugStatus/);
  assert.match(paymentGateSource, /Crédito ativo encontrado; relatório liberado/);
  assert.match(paymentGateSource, /Pagamento confirmado\. Relatório liberado\./);
  assert.match(paymentGateSource, /onReady\(buildPaymentV1Entitlement/);
});

test('noGenericUnexpectedError', async () => {
  assert.doesNotMatch(paymentGateSource, /unexpected_error/);
  assert.doesNotMatch(paymentServiceSource, /unexpected_error/);
  const store = makeStore();
  await createCheckout(store);
  const { body } = await runWebhook(store, { id: 'evt_no_order', event: 'CHECKOUT_PAID', checkout: { id: 'missing_checkout' } });
  assert.notEqual(body.debugCode, 'unexpected_error');
  assert.equal(body.debugCode, 'webhook_order_not_found');
});

const results = [];
for (const { name, fn } of tests) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error?.message || String(error) });
  }
}

const failed = results.filter((result) => result.status === 'FAIL');
originalConsole.log(JSON.stringify({ status: failed.length === 0 ? 'PASS' : 'FAIL', total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
