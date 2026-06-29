import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const plansModule = await import('../netlify/functions/_paymentV1/paymentPlans.mjs');
const ordersModule = await import('../netlify/functions/_paymentV1/paymentOrders.mjs');
const checkoutModule = await import('../netlify/functions/payment-v1-create-checkout.mjs');
const webhookModule = await import('../netlify/functions/payment-v1-asaas-webhook.mjs');

const makeStore = () => {
  const state = {
    orders: [],
    events: new Set(),
    credits: [],
  };
  return {
    state,
    async createPendingOrder({ plan, externalReference, userId = null }) {
      const order = {
        id: `order_${state.orders.length + 1}`,
        user_id: userId,
        plan_code: plan.code,
        provider: 'asaas',
        external_reference: externalReference,
        status: 'pending',
        amount_cents: ordersModule.amountCentsForPlan(plan),
        analysis_limit: plan.analysisLimit,
      };
      state.orders.push(order);
      return order;
    },
    async updateOrderCheckout({ orderId, checkoutId, checkoutUrl }) {
      const order = state.orders.find((item) => item.id === orderId);
      Object.assign(order, { provider_checkout_id: checkoutId, checkout_url: checkoutUrl });
      return order;
    },
    async findOrderForWebhook({ externalReference, checkoutId }) {
      return state.orders.find((order) => order.external_reference === externalReference || order.provider_checkout_id === checkoutId) || null;
    },
    async recordWebhookEvent({ eventId }) {
      if (state.events.has(eventId)) return { duplicate: true, event: null };
      state.events.add(eventId);
      return { duplicate: false, event: { id: `evt_${state.events.size}`, event_id: eventId } };
    },
    async updateOrderStatus({ orderId, status }) {
      const order = state.orders.find((item) => item.id === orderId);
      Object.assign(order, { status, paid_at: status === 'paid' ? new Date().toISOString() : order.paid_at });
      return order;
    },
    async createCreditForOrderOnce({ order }) {
      const existing = state.credits.find((credit) => credit.order_id === order.id);
      if (existing) return { duplicate: true, credit: existing };
      const credit = {
        id: `credit_${state.credits.length + 1}`,
        order_id: order.id,
        plan_code: order.plan_code,
        analysis_limit: order.analysis_limit,
        analysis_used: 0,
        status: 'active',
      };
      state.credits.push(credit);
      return { duplicate: false, credit };
    },
  };
};

const paidPayload = (order, overrides = {}) => ({
  id: overrides.id || 'evt_paid_1',
  event: overrides.event || 'CHECKOUT_PAID',
  checkout: {
    id: order.provider_checkout_id,
    externalReference: order.external_reference,
  },
});

const webhookEvent = (payload, token = 'test_webhook_token') => ({
  httpMethod: 'POST',
  headers: { 'asaas-access-token': token },
  body: JSON.stringify(payload),
});

const createCheckout = async (store) => {
  const handler = checkoutModule.createHandler({
    paymentOrders: store,
    buildExternalReference: ({ planCode }) => `vf-payment-v1-${planCode}-fixed`,
    asaasClient: {
      async createAsaasCheckout({ plan, externalReference }) {
        return {
          checkoutUrl: `https://sandbox.asaas.com/checkoutSession/show/chk_${plan.code}`,
          checkoutId: `chk_${plan.code}`,
          planCode: plan.code,
          externalReference,
        };
      },
    },
  });
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ planCode: 'report_50_beta' }),
  });
  assert.equal(response.statusCode, 200);
  return JSON.parse(response.body);
};

test('paymentV1WebhookModulesLoad', () => {
  assert.equal(typeof ordersModule.createPaymentOrderStore, 'function');
  assert.equal(typeof webhookModule.createHandler, 'function');
  assert.equal(plansModule.getPaymentV1Plan('report_50_beta').analysisLimit, 50);
});

test('createCheckoutCreatesPendingOrder', async () => {
  const store = makeStore();
  await createCheckout(store);
  assert.equal(store.state.orders.length, 1);
  assert.equal(store.state.orders[0].status, 'pending');
});

test('createCheckoutStoresExternalReference', async () => {
  const store = makeStore();
  await createCheckout(store);
  assert.equal(store.state.orders[0].external_reference, 'vf-payment-v1-report_50_beta-fixed');
});

test('createCheckoutStoresCheckoutIdAndUrl', async () => {
  const store = makeStore();
  await createCheckout(store);
  assert.equal(store.state.orders[0].provider_checkout_id, 'chk_report_50_beta');
  assert.equal(store.state.orders[0].checkout_url, 'https://sandbox.asaas.com/checkoutSession/show/chk_report_50_beta');
});

test('webhookInvalidTokenRejected', async () => {
  const handler = webhookModule.createHandler({ paymentOrders: makeStore(), env: { ASAAS_WEBHOOK_TOKEN: 'expected' } });
  const response = await handler(webhookEvent({ event: 'CHECKOUT_PAID' }, 'wrong'));
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 401);
  assert.equal(body.debugCode, 'webhook_invalid_token');
});

test('webhookPaidMarksOrderPaid', async () => {
  const store = makeStore();
  await createCheckout(store);
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  const response = await handler(webhookEvent(paidPayload(store.state.orders[0])));
  assert.equal(response.statusCode, 200);
  assert.equal(store.state.orders[0].status, 'paid');
});

test('webhookPaidCreatesCreditOnce', async () => {
  const store = makeStore();
  await createCheckout(store);
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  await handler(webhookEvent(paidPayload(store.state.orders[0])));
  assert.equal(store.state.credits.length, 1);
  assert.equal(store.state.credits[0].analysis_limit, 50);
});

test('duplicateWebhookDoesNotDuplicateCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  await handler(webhookEvent(paidPayload(store.state.orders[0])));
  const duplicate = await handler(webhookEvent(paidPayload(store.state.orders[0])));
  const body = JSON.parse(duplicate.body);
  assert.equal(body.debugCode, 'webhook_event_duplicate');
  assert.equal(store.state.credits.length, 1);
});

test('webhookCanceledDoesNotCreateCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  await handler(webhookEvent(paidPayload(store.state.orders[0], { id: 'evt_cancel', event: 'CHECKOUT_CANCELED' })));
  assert.equal(store.state.orders[0].status, 'canceled');
  assert.equal(store.state.credits.length, 0);
});

test('webhookExpiredDoesNotCreateCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  await handler(webhookEvent(paidPayload(store.state.orders[0], { id: 'evt_expire', event: 'CHECKOUT_EXPIRED' })));
  assert.equal(store.state.orders[0].status, 'expired');
  assert.equal(store.state.credits.length, 0);
});

test('webhookOrderNotFoundReturnsDebugCode', async () => {
  const store = makeStore();
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  const response = await handler(webhookEvent({ id: 'evt_missing', event: 'CHECKOUT_PAID', checkout: { id: 'missing', externalReference: 'missing' } }));
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.debugCode, 'webhook_order_not_found');
});

test('noGenericErrorWithoutDebugCode', async () => {
  const handler = checkoutModule.createHandler({ paymentOrders: makeStore() });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({}) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 400);
  assert.equal(body.debugCode, 'missing_plan_code');
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
console.log(JSON.stringify({
  status: failed.length === 0 ? 'PASS' : 'FAIL',
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
