import assert from 'node:assert/strict';

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
const USER_B = '00000000-0000-4000-8000-000000000002';

const makeStore = () => {
  const state = { orders: [], events: [], credits: [] };
  return {
    state,
    async createPendingOrder({ plan, externalReference, userId }) {
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
      Object.assign(order, {
        provider_checkout_id: checkoutId,
        checkout_url: checkoutUrl,
        updated_at: new Date().toISOString(),
      });
      return order;
    },
    async findOrderForWebhook({ externalReference, checkoutId }) {
      return state.orders.find((order) => order.external_reference === externalReference || order.provider_checkout_id === checkoutId) || null;
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
      const refs = new Set(orders.map((order) => order.external_reference).filter(Boolean));
      const checkoutIds = new Set(orders.map((order) => order.provider_checkout_id).filter(Boolean));
      return state.events.filter((event) => refs.has(event.external_reference) || checkoutIds.has(event.provider_checkout_id));
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

const captureLogs = async (fn) => {
  const previous = { info: console.info, warn: console.warn, error: console.error };
  const logs = [];
  const capture = (line) => {
    try {
      logs.push(JSON.parse(String(line)));
    } catch {
      logs.push({ raw: String(line) });
    }
  };
  console.info = capture;
  console.warn = capture;
  console.error = capture;
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.info = previous.info;
    console.warn = previous.warn;
    console.error = previous.error;
  }
};

const createCheckout = async (store, userId = USER_A) => {
  const handler = checkoutModule.createHandler({
    paymentOrders: store,
    authenticateRequest: async () => ({ userId }),
    buildExternalReference: ({ planCode }) => `vf-payment-v1-${planCode}-${store.state.orders.length + 1}`,
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
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode: 'report_50_beta' }) });
  assert.equal(response.statusCode, 200);
  return parseBody(response);
};

const runPaidWebhook = async (store, order) => {
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  const response = await handler({
    httpMethod: 'POST',
    headers: { 'asaas-access-token': 'test_webhook_token' },
    body: JSON.stringify({
      id: 'evt_paid_1',
      event: 'CHECKOUT_PAID',
      checkout: {
        id: order.provider_checkout_id,
        externalReference: order.external_reference,
      },
      authorization: 'Bearer must_not_leak',
    }),
  });
  assert.equal(response.statusCode, 200);
  return parseBody(response);
};

const debugStatus = async (store, userId = USER_A) => {
  const handler = debugStatusModule.createHandler({
    paymentOrders: store,
    authenticateRequest: async () => ({ userId }),
  });
  const response = await handler({ httpMethod: 'GET' });
  return { response, body: parseBody(response) };
};

test('debugStatusRequiresAuth', async () => {
  const handler = debugStatusModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw Object.assign(new Error('missing'), { debugCode: 'missing_auth_header', statusCode: 401 }); },
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = parseBody(response);
  assert.equal(response.statusCode, 401);
  assert.equal(body.debugCode, 'missing_auth_header');
});

test('debugStatusShowsNoOrders', async () => {
  const { response, body } = await debugStatus(makeStore());
  assert.equal(response.statusCode, 200);
  assert.equal(body.userId, USER_A);
  assert.deepEqual(body.latestOrders, []);
  assert.deepEqual(body.latestCredits, []);
  assert.deepEqual(body.latestEvents, []);
  assert.equal(body.counts.ordersCount, 0);
});

test('debugStatusShowsPendingOrder', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { body } = await debugStatus(store);
  assert.equal(body.counts.pendingOrdersCount, 1);
  assert.equal(body.latestOrders[0].status, 'pending');
  assert.equal(body.latestOrders[0].externalReference, store.state.orders[0].external_reference);
});

test('debugStatusShowsPaidOrder', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0]);
  const { body } = await debugStatus(store);
  assert.equal(body.counts.paidOrdersCount, 1);
  assert.equal(body.latestOrders[0].status, 'paid');
  assert.equal(body.counts.eventsCount, 1);
});

test('debugStatusShowsActiveCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0]);
  const { body } = await debugStatus(store);
  assert.equal(body.counts.activeCreditsCount, 1);
  assert.equal(body.latestCredits[0].status, 'active');
  assert.equal(body.latestCredits[0].analysisLimit, 50);
});

test('debugStatusDoesNotExposeSecrets', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0]);
  const { body } = await debugStatus(store);
  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes('must_not_leak'), false);
  assert.equal(serialized.includes('authorization'), false);
  assert.equal(serialized.includes('service_role'), false);
  assert.equal(serialized.includes('access_token'), false);
  assert.equal(serialized.includes('"raw"'), false);
  assert.equal(body.latestEvents[0].raw, undefined);
});

test('createCheckoutLogsOrderReference', async () => {
  const store = makeStore();
  const { logs } = await captureLogs(() => createCheckout(store));
  assert.ok(logs.some((log) => log.scope === 'payment-v1-create-checkout' && log.stage === 'order_create_start' && log.externalReference));
  assert.ok(logs.some((log) => log.stage === 'checkout_success' && log.orderId === 'order_1' && log.checkoutId === store.state.orders[0].provider_checkout_id));
  assert.equal(JSON.stringify(logs).includes(USER_A), false);
});

test('webhookLogsProcessingStage', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { logs } = await captureLogs(() => runPaidWebhook(store, store.state.orders[0]));
  assert.ok(logs.some((log) => log.scope === 'payment-v1-asaas-webhook' && log.stage === 'webhook_payload_parse_start'));
  assert.ok(logs.some((log) => log.stage === 'webhook_paid_success' && log.orderId === 'order_1' && log.checkoutId === store.state.orders[0].provider_checkout_id));
  assert.equal(JSON.stringify(logs).includes(USER_A), false);
});

test('statusLogsQueryStage', async () => {
  const store = makeStore();
  await createCheckout(store);
  const handler = statusModule.createHandler({ paymentOrders: store, authenticateRequest: async () => ({ userId: USER_A }) });
  const { result: response, logs } = await captureLogs(() => handler({ httpMethod: 'GET' }));
  assert.equal(response.statusCode, 200);
  assert.ok(logs.some((log) => log.scope === 'payment-v1-status' && log.stage === 'query_start'));
  assert.ok(logs.some((log) => log.stage === 'status_success' && log.orderId === 'order_1'));
  assert.equal(JSON.stringify(logs).includes(USER_A), false);
});

test('debugStatusDoesNotExposeOtherUserData', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  const { body } = await debugStatus(store, USER_B);
  assert.equal(body.userId, USER_B);
  assert.equal(body.counts.ordersCount, 0);
  assert.equal(body.counts.creditsCount, 0);
  assert.equal(body.counts.eventsCount, 0);
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
