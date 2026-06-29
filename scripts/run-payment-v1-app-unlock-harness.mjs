import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const ordersModule = await import('../netlify/functions/_paymentV1/paymentOrders.mjs');
const checkoutModule = await import('../netlify/functions/payment-v1-create-checkout.mjs');
const webhookModule = await import('../netlify/functions/payment-v1-asaas-webhook.mjs');
const statusModule = await import('../netlify/functions/payment-v1-status.mjs');

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';

const makeStore = () => {
  const state = { orders: [], events: new Set(), credits: [] };
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
    async getPaymentStatusForUser({ userId }) {
      return {
        activeCredits: state.credits.filter((credit) => credit.user_id === userId && credit.status === 'active'),
        pendingOrders: state.orders.filter((order) => order.user_id === userId && order.status === 'pending'),
        paidOrders: state.orders.filter((order) => order.user_id === userId && order.status === 'paid'),
      };
    },
  };
};

const createCheckout = async (store, userId = USER_A, planCode = 'report_50_beta') => {
  const handler = checkoutModule.createHandler({
    paymentOrders: store,
    authenticateRequest: async () => ({ userId }),
    buildExternalReference: ({ planCode: code }) => `vf-payment-v1-${code}-${store.state.orders.length + 1}`,
    asaasClient: {
      async createAsaasCheckout({ plan, externalReference }) {
        return {
          checkoutUrl: `https://sandbox.asaas.com/checkoutSession/show/chk_${store.state.orders.length + 1}`,
          checkoutId: `chk_${store.state.orders.length + 1}`,
          planCode: plan.code,
          externalReference,
        };
      },
    },
  });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode }) });
  assert.equal(response.statusCode, 200);
  return JSON.parse(response.body);
};

const statusForUser = async (store, userId = USER_A) => {
  const handler = statusModule.createHandler({ paymentOrders: store, authenticateRequest: async () => ({ userId }) });
  const response = await handler({ httpMethod: 'GET' });
  assert.equal(response.statusCode, 200);
  return JSON.parse(response.body);
};

const webhookEvent = (payload, token = 'test_webhook_token') => ({
  httpMethod: 'POST',
  headers: { 'asaas-access-token': token },
  body: JSON.stringify(payload),
});

const paidPayload = (order, id = 'evt_paid_1') => ({
  id,
  event: 'CHECKOUT_PAID',
  checkout: {
    id: order.provider_checkout_id,
    externalReference: order.external_reference,
  },
});

const runPaidWebhook = async (store, order, id = 'evt_paid_1') => {
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  return handler(webhookEvent(paidPayload(order, id)));
};

test('statusRequiresAuth', async () => {
  const handler = statusModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw Object.assign(new Error('missing'), { debugCode: 'missing_auth_header', statusCode: 401 }); },
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 401);
  assert.equal(body.debugCode, 'missing_auth_header');
});

test('statusShowsNoCreditBeforePayment', async () => {
  const store = makeStore();
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.deepEqual(body.activeCredits, []);
  assert.deepEqual(body.pendingOrders, []);
  assert.deepEqual(body.paidOrders, []);
});

test('paidWebhookCreatesActiveCredit', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  await runPaidWebhook(store, store.state.orders[0]);
  assert.equal(store.state.orders[0].status, 'paid');
  assert.equal(store.state.credits.length, 1);
  assert.equal(store.state.credits[0].status, 'active');
});

test('statusShowsActiveCreditAfterWebhook', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  await runPaidWebhook(store, store.state.orders[0]);
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, true);
  assert.equal(body.activeCredits.length, 1);
  assert.equal(body.activeCredits[0].analysisLimit, 50);
  assert.equal(body.paidOrders.length, 1);
});

test('duplicateWebhookDoesNotDuplicateCredit', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  await runPaidWebhook(store, store.state.orders[0], 'evt_duplicate');
  const duplicateResponse = await runPaidWebhook(store, store.state.orders[0], 'evt_duplicate');
  const duplicateBody = JSON.parse(duplicateResponse.body);
  assert.equal(duplicateBody.debugCode, 'webhook_event_duplicate');
  assert.equal(store.state.credits.length, 1);
});

test('crossUserCannotSeeCredit', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  await runPaidWebhook(store, store.state.orders[0]);
  const body = await statusForUser(store, USER_B);
  assert.equal(body.hasActiveCredit, false);
  assert.equal(body.activeCredits.length, 0);
  assert.equal(body.paidOrders.length, 0);
});

test('pendingOrderShowsPaymentInConfirmation', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.equal(body.pendingOrders.length, 1);
  assert.equal(body.pendingOrders[0].status, 'pending');
});

test('noGenericErrorWithoutDebugCode', async () => {
  const handler = statusModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw new Error('boom'); },
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 500);
  assert.equal(typeof body.debugCode, 'string');
  assert.notEqual(body.debugCode.length, 0);
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
console.log(JSON.stringify({ status: failed.length === 0 ? 'PASS' : 'FAIL', total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;