import assert from 'node:assert/strict';
import fs from 'node:fs';

const originalConsole = { ...console };
console.info = () => {};
console.warn = () => {};
console.error = () => {};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const ordersModule = await import('../netlify/functions/_paymentV1/paymentOrders.mjs');
const reconcileModule = await import('../netlify/functions/payment-v1-reconcile.mjs');
const asaasModule = await import('../netlify/functions/_paymentV1/asaasClient.mjs');

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';

const paymentGateSource = fs.readFileSync('src/components/PaymentV1Gate.tsx', 'utf8');
const paymentServiceSource = fs.readFileSync('src/lib/services/paymentV1Service.ts', 'utf8');

const makePlan = () => ({
  code: 'report_50_beta',
  name: 'Relatório 50',
  description: 'Relatório beta',
  value: 49.9,
  analysisLimit: 50,
});

const makeStore = () => {
  const state = { orders: [], credits: [] };
  const store = {
    state,
    async createPendingOrder({ plan = makePlan(), externalReference = `vf-payment-v1-${state.orders.length + 1}`, userId = USER_A } = {}) {
      const order = {
        id: `order_${state.orders.length + 1}`,
        user_id: userId,
        plan_code: plan.code,
        provider: 'asaas',
        provider_checkout_id: `chk_${state.orders.length + 1}`,
        checkout_url: `https://sandbox.asaas.com/checkoutSession/show/chk_${state.orders.length + 1}`,
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
    async listRecentOrdersForUser({ userId }) {
      return state.orders.filter((order) => order.user_id === userId);
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
    async listActiveCreditsForUser({ userId }) {
      return state.credits.filter((credit) => credit.user_id === userId && credit.status === 'active');
    },
  };
  return store;
};

const parseBody = (response) => JSON.parse(response.body);

const reconcile = async ({ store = makeStore(), userId = USER_A, asaasClient } = {}) => {
  const handler = reconcileModule.createHandler({
    paymentOrders: store,
    authenticateRequest: async () => ({ userId }),
    asaasClient,
    env: {
      ASAAS_ENV: 'sandbox',
      ASAAS_API_KEY: 'asaas_api_key_not_printed',
    },
  });
  const response = await handler({ httpMethod: 'POST', headers: { Authorization: 'Bearer valid-token' } });
  return { response, body: parseBody(response), store };
};

const unpaidAsaasClient = {
  async getAsaasPaymentConfirmation() {
    return {
      confirmed: false,
      matchedBy: null,
      status: 'PENDING',
      attempts: [],
    };
  },
};

const paidAsaasClient = {
  async getAsaasPaymentConfirmation({ checkoutId, externalReference }) {
    assert.ok(checkoutId || externalReference);
    return {
      confirmed: true,
      matchedBy: externalReference ? 'external_reference' : 'checkout_id',
      status: 'RECEIVED',
      asaasStatus: 200,
      responseKeys: ['data'],
      attempts: [],
    };
  },
};

test('reconcileRequiresAuth', async () => {
  const handler = reconcileModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw Object.assign(new Error('missing'), { debugCode: 'missing_auth_header', statusCode: 401 }); },
    asaasClient: unpaidAsaasClient,
  });
  const response = await handler({ httpMethod: 'POST' });
  const body = parseBody(response);
  assert.equal(response.statusCode, 401);
  assert.equal(body.debugCode, 'missing_auth_header');
});

test('reconcileFindsPendingOrder', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  const { response, body } = await reconcile({ store, asaasClient: unpaidAsaasClient });
  assert.equal(response.statusCode, 200);
  assert.equal(body.pendingOrders.length, 1);
  assert.equal(body.pendingOrders[0].status, 'pending');
});

test('reconcileDoesNotUnlockUnpaidOrder', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  const { body } = await reconcile({ store, asaasClient: unpaidAsaasClient });
  assert.equal(store.state.orders[0].status, 'pending');
  assert.equal(store.state.credits.length, 0);
  assert.equal(body.activeCredits.length, 0);
});

test('reconcilePaidAsaasCheckoutMarksOrderPaid', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  const { response, body } = await reconcile({ store, asaasClient: paidAsaasClient });
  assert.equal(response.statusCode, 200);
  assert.equal(store.state.orders[0].status, 'paid');
  assert.equal(body.reconciledOrders.length, 1);
  assert.equal(body.reconciledOrders[0].status, 'paid');
});

test('reconcilePaidAsaasCheckoutCreatesActiveCredit', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  await reconcile({ store, asaasClient: paidAsaasClient });
  assert.equal(store.state.credits.length, 1);
  assert.equal(store.state.credits[0].status, 'active');
  assert.equal(store.state.credits[0].analysis_limit, 50);
});

test('reconcileDoesNotDuplicateCredit', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  await reconcile({ store, asaasClient: paidAsaasClient });
  await store.updateOrderStatus({ orderId: 'order_1', status: 'pending' });
  await reconcile({ store, asaasClient: paidAsaasClient });
  assert.equal(store.state.credits.length, 1);
});

test('reconcileReturnsActiveCredit', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  const { body } = await reconcile({ store, asaasClient: paidAsaasClient });
  assert.equal(body.activeCredits.length, 1);
  assert.equal(body.activeCredits[0].status, 'active');
});

test('reconcileOnlyUsesAuthenticatedUserOrders', async () => {
  const store = makeStore();
  await store.createPendingOrder({ userId: USER_A });
  await store.createPendingOrder({ userId: USER_B });
  const { body } = await reconcile({ store, userId: USER_B, asaasClient: paidAsaasClient });
  assert.equal(body.reconciledOrders.length, 1);
  assert.equal(body.reconciledOrders[0].id, 'order_2');
  assert.equal(store.state.orders[0].status, 'pending');
});

test('uiVerifyPaymentCallsReconcileThenStatus', () => {
  assert.match(paymentServiceSource, /reconcilePaymentV1/);
  assert.match(paymentServiceSource, /payment-v1-reconcile/);
  assert.match(paymentGateSource, /reconcilePaymentV1/);
  const reconcileIndex = paymentGateSource.indexOf('await reconcilePaymentV1()');
  const statusIndex = paymentGateSource.indexOf('const reconciledStatus = await getPaymentV1Status()');
  assert.ok(reconcileIndex > -1);
  assert.ok(statusIndex > reconcileIndex);
});

test('asaasLookupConfirmsPaymentByExternalReference', async () => {
  const result = await asaasModule.getAsaasPaymentConfirmation({
    checkoutId: 'chk_1',
    externalReference: 'vf-payment-v1-report_50_beta-1',
    env: {
      ASAAS_ENV: 'sandbox',
      ASAAS_API_KEY: 'asaas_api_key_not_printed',
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/checkouts/chk_1')) {
        return { ok: false, status: 404, text: async () => JSON.stringify({ message: 'not found' }) };
      }
      assert.ok(url.includes('/payments?externalReference='));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [{
            id: 'pay_1',
            status: 'RECEIVED',
            externalReference: 'vf-payment-v1-report_50_beta-1',
          }],
        }),
      };
    },
  });
  assert.equal(result.confirmed, true);
  assert.equal(result.matchedBy, 'external_reference');
});

test('noUnexpectedErrorInReconcile', async () => {
  const store = makeStore();
  await store.createPendingOrder();
  const { response, body } = await reconcile({
    store,
    asaasClient: {
      async getAsaasPaymentConfirmation() {
        throw new Error('raw reconcile failure');
      },
    },
  });
  assert.equal(response.statusCode, 500);
  assert.notEqual(body.debugCode, 'unexpected_error');
  assert.equal(body.debugCode, 'reconcile_unexpected_error');
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
