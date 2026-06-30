import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PaymentV1Error } from '../netlify/functions/_paymentV1/paymentErrors.mjs';

const originalConsole = { ...console };
console.info = () => {};
console.warn = () => {};
console.error = () => {};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const authModule = await import('../netlify/functions/_paymentV1/paymentAuth.mjs');
const ordersModule = await import('../netlify/functions/_paymentV1/paymentOrders.mjs');
const checkoutModule = await import('../netlify/functions/payment-v1-create-checkout.mjs');
const webhookModule = await import('../netlify/functions/payment-v1-asaas-webhook.mjs');
const statusModule = await import('../netlify/functions/payment-v1-status.mjs');
const asaasModule = await import('../netlify/functions/_paymentV1/asaasClient.mjs');

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SUPABASE_ENV = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_key_not_printed',
};
const USER_B = '00000000-0000-4000-8000-000000000002';

const paymentServiceSource = fs.readFileSync('src/lib/services/paymentV1Service.ts', 'utf8');
const paymentGateSource = fs.readFileSync('src/components/PaymentV1Gate.tsx', 'utf8');

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
      if (!order.user_id) throw Object.assign(new Error('user_id required'), { debugCode: 'credit_create_failed', statusCode: 500 });
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

const createCheckout = async (store, { userId = USER_ID, asaasClient = null } = {}) => {
  const handler = checkoutModule.createHandler({
    paymentOrders: store,
    authenticateRequest: async () => ({ userId }),
    buildExternalReference: ({ planCode }) => `vf-payment-v1-${planCode}-fixed-${store.state.orders.length + 1}`,
    asaasClient: asaasClient || {
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
  return { response, body: JSON.parse(response.body) };
};

const paidPayload = (order, id = 'evt_paid_1') => ({
  id,
  event: 'CHECKOUT_PAID',
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

const runPaidWebhook = async (store, order, id = 'evt_paid_1') => {
  const handler = webhookModule.createHandler({ paymentOrders: store, env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  const response = await handler(webhookEvent(paidPayload(order, id)));
  return { response, body: JSON.parse(response.body) };
};

const getStatus = async (store, userId = USER_ID) => {
  const handler = statusModule.createHandler({ paymentOrders: store, authenticateRequest: async () => ({ userId }) });
  const response = await handler({ httpMethod: 'GET' });
  return { response, body: JSON.parse(response.body) };
};

test('checkoutRequiresAuth', async () => {
  const handler = checkoutModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw Object.assign(new Error('missing'), { debugCode: 'missing_auth_header', statusCode: 401 }); },
  });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode: 'report_50_beta' }) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 401);
  assert.equal(body.debugCode, 'missing_auth_header');
});

test('checkoutSendsAuthorizationFromFrontend', () => {
  assert.match(paymentServiceSource, /getCurrentAccessToken\(\)/);
  assert.match(paymentServiceSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(paymentServiceSource, /payment-v1-create-checkout/);
});

test('statusRequestSendsAuthorizationBearer', () => {
  assert.match(paymentServiceSource, /payment-v1-status/);
  assert.match(paymentServiceSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
});

test('frontendDoesNotSendEmptyBearer', () => {
  assert.match(paymentServiceSource, /normalizeAccessToken/);
  assert.match(paymentServiceSource, /missing_auth_token/);
  assert.doesNotMatch(paymentServiceSource, /Bearer \$\{accessToken \|\|/);
  assert.doesNotMatch(paymentServiceSource, /Bearer undefined|Bearer null/);
});

test('missingSessionDoesNotCallStatusAsAuthenticated', () => {
  assert.match(paymentServiceSource, /if \(!accessToken\) \{/);
  assert.match(paymentServiceSource, /authRequired:\s*true/);
});

test('missingSessionDoesNotCallProtectedBackend', () => {
  assert.match(paymentServiceSource, /return \{\s*\.\.\.EMPTY_PAYMENT_V1_STATUS,[\s\S]*authRequired:\s*true/);
});

test('missingSessionBlocksCheckoutWithFriendlyMessage', () => {
  assert.match(paymentGateSource, /hasPaymentV1AuthSession\(\)/);
  assert.match(paymentGateSource, /Faça login novamente para comprar crédito\./);
});

test('missingSessionShowsFriendlyMessage', () => {
  assert.match(paymentGateSource, /loginAgainMessage/);
  assert.match(paymentGateSource, /isAuthSessionError/);
  assert.doesNotMatch(paymentGateSource, /setCheckoutError\(.*missing_auth_header/);
});

test('noMissingAuthHeaderFromFrontendWhenSessionExists', () => {
  assert.doesNotMatch(paymentServiceSource, /debugCode\s*=\s*['"]missing_auth_header['"]/);
});

test('backendRejectsMalformedAuthorization', () => {
  assert.throws(
    () => authModule.getBearerTokenFromEvent({ headers: { Authorization: 'Token abc' } }),
    (error) => error.debugCode === 'invalid_auth_header_format' && error.statusCode === 401
  );
});

test('supabaseGetUserFailureHasSpecificDebugCode', async () => {
  await assert.rejects(
    () => authModule.verifySupabaseAccessToken({
      accessToken: 'valid-looking-token',
      env: SUPABASE_ENV,
      fetchImpl: async () => { throw new Error('network down'); },
    }),
    (error) => error.debugCode === 'supabase_auth_get_user_failed' && error.statusCode === 502
  );
});

test('validSessionTokenAccepted', async () => {
  const authUser = await authModule.verifySupabaseAccessToken({
    accessToken: 'valid-session-token',
    env: SUPABASE_ENV,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${SUPABASE_ENV.SUPABASE_URL}/auth/v1/user`);
      assert.equal(options.headers.Authorization, 'Bearer valid-session-token');
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: USER_ID, email: 'user@example.test' }) };
    },
  });
  assert.equal(authUser.userId, USER_ID);
});

test('noInvalidAuthTokenForValidSession', async () => {
  const authUser = await authModule.authenticatePaymentV1Request({
    event: { headers: { Authorization: 'Bearer valid-session-token' } },
    env: SUPABASE_ENV,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: USER_ID }) }),
  });
  assert.equal(authUser.userId, USER_ID);
});
test('checkoutCreatesPendingOrderWithUserId', async () => {
  const store = makeStore();
  const { response, body } = await createCheckout(store);
  assert.equal(response.statusCode, 200);
  assert.equal(body.orderId, 'order_1');
  assert.equal(store.state.orders.length, 1);
  assert.equal(store.state.orders[0].status, 'pending');
  assert.equal(store.state.orders[0].user_id, USER_ID);
});

test('checkoutErrorHasSpecificDebugCode', async () => {
  const store = makeStore();
  const { response, body } = await createCheckout(store, {
    asaasClient: {
      async createAsaasCheckout() {
        throw new PaymentV1Error('Asaas checkout request failed.', { debugCode: 'asaas_request_failed', statusCode: 502 });
      },
    },
  });
  assert.equal(response.statusCode, 502);
  assert.equal(body.debugCode, 'asaas_request_failed');
});

test('paidWebhookMarksOrderPaid', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0]);
  assert.equal(store.state.orders[0].status, 'paid');
});

test('paidWebhookCreatesActiveCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  const { response, body } = await runPaidWebhook(store, store.state.orders[0]);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'paid');
  assert.equal(store.state.credits.length, 1);
  assert.equal(store.state.credits[0].status, 'active');
  assert.equal(store.state.credits[0].user_id, USER_ID);
});

test('duplicateWebhookDoesNotDuplicateCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0], 'evt_dup');
  const duplicate = await runPaidWebhook(store, store.state.orders[0], 'evt_dup');
  assert.equal(duplicate.body.debugCode, 'webhook_event_duplicate');
  assert.equal(store.state.credits.length, 1);
});

test('statusShowsActiveCreditAfterWebhook', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0]);
  const { response, body } = await getStatus(store);
  assert.equal(response.statusCode, 200);
  assert.equal(body.hasActiveCredit, true);
  assert.equal(body.activeCredits.length, 1);
  assert.equal(body.paidOrders.length, 1);
});

test('statusNoCreditReturnsSuccess', async () => {
  const { response, body } = await getStatus(makeStore());
  assert.equal(response.statusCode, 200);
  assert.equal(body.hasActiveCredit, false);
  assert.deepEqual(body.activeCredits, []);
  assert.deepEqual(body.pendingOrders, []);
  assert.deepEqual(body.paidOrders, []);
});

test('returnRefreshShowsUnlocked', () => {
  assert.match(paymentGateSource, /getPaymentV1Status\(\)/);
  assert.match(paymentGateSource, /refreshPaymentStatus/);
  assert.match(paymentGateSource, /Pagamento confirmado\. Relatório liberado\./);
});

test('noUnexpectedErrorInCheckout', async () => {
  const store = makeStore();
  const { body } = await createCheckout(store, {
    asaasClient: {
      async createAsaasCheckout() {
        throw new Error('raw checkout failure');
      },
    },
  });
  assert.notEqual(body.debugCode, 'unexpected_error');
  assert.equal(body.debugCode, 'checkout_unhandled_error');
});

test('noUnexpectedErrorInStatus', async () => {
  const handler = statusModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw new Error('raw status failure'); },
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = JSON.parse(response.body);
  assert.notEqual(body.debugCode, 'unexpected_error');
  assert.equal(body.debugCode, 'status_unexpected_error');
});

test('noUnexpectedErrorInWebhook', async () => {
  const handler = webhookModule.createHandler({ paymentOrders: makeStore(), env: { ASAAS_WEBHOOK_TOKEN: 'test_webhook_token' } });
  const response = await handler({ httpMethod: 'POST', headers: { 'asaas-access-token': 'test_webhook_token' }, body: '{bad json' });
  const body = JSON.parse(response.body);
  assert.notEqual(body.debugCode, 'unexpected_error');
  assert.equal(body.debugCode, 'webhook_invalid_json');
});

test('asaasNetworkFailureHasSpecificDebugCode', async () => {
  await assert.rejects(
    () => asaasModule.createAsaasCheckout({
      plan: { code: 'report_50_beta', name: 'Relatório 50', description: 'Relatório beta', value: 49.9 },
      externalReference: 'vf-test',
      env: {
        ASAAS_ENV: 'sandbox',
        ASAAS_API_KEY: 'test_key_not_printed',
        ASAAS_SUCCESS_URL: 'https://example.test/success',
        ASAAS_CANCEL_URL: 'https://example.test/cancel',
        ASAAS_EXPIRED_URL: 'https://example.test/expired',
      },
      fetchImpl: async () => { throw new Error('network down'); },
    }),
    (error) => error.debugCode === 'asaas_request_failed'
  );
});

test('crossUserCannotSeeCredit', async () => {
  const store = makeStore();
  await createCheckout(store);
  await runPaidWebhook(store, store.state.orders[0]);
  const { body } = await getStatus(store, USER_B);
  assert.equal(body.hasActiveCredit, false);
  assert.equal(body.activeCredits.length, 0);
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