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
const authModule = await import('../netlify/functions/_paymentV1/paymentAuth.mjs');

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const SUPABASE_ENV = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_key_not_printed',
};

const paymentServiceSource = fs.readFileSync('src/lib/services/paymentV1Service.ts', 'utf8');
const paymentGateSource = fs.readFileSync('src/components/PaymentV1Gate.tsx', 'utf8');

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

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

const makeSupabaseStatusStore = ({ credits = [], orders = [], failCredits = false, failOrders = false } = {}) => ordersModule.createPaymentOrderStore({
  env: SUPABASE_ENV,
  fetchImpl: async (url) => {
    if (url.includes('payment_v1_credits')) {
      if (failCredits) return jsonResponse(500, { message: 'credits query failed', authorization: 'Bearer should_not_leak' });
      return jsonResponse(200, credits);
    }
    if (url.includes('payment_v1_orders')) {
      if (failOrders) return jsonResponse(500, { message: 'orders query failed', apikey: 'should_not_leak' });
      return jsonResponse(200, orders);
    }
    return jsonResponse(404, { message: 'unexpected path' });
  },
});

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

const statusResponseForUser = async (store, userId = USER_A) => {
  const handler = statusModule.createHandler({ paymentOrders: store, authenticateRequest: async () => ({ userId }) });
  const response = await handler({ httpMethod: 'GET' });
  return { response, body: JSON.parse(response.body) };
};

const statusForUser = async (store, userId = USER_A) => {
  const { response, body } = await statusResponseForUser(store, userId);
  assert.equal(response.statusCode, 200);
  return body;
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

test('statusRequestSendsAuthorizationBearer', () => {
  assert.match(paymentServiceSource, /payment-v1-status/);
  assert.match(paymentServiceSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
});

test('checkoutRequestSendsAuthorizationBearer', () => {
  assert.match(paymentServiceSource, /payment-v1-create-checkout/);
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
      return jsonResponse(200, { id: USER_A, email: 'user@example.test' });
    },
  });
  assert.equal(authUser.userId, USER_A);
});

test('noInvalidAuthTokenForValidSession', async () => {
  const authUser = await authModule.authenticatePaymentV1Request({
    event: { headers: { Authorization: 'Bearer valid-session-token' } },
    env: SUPABASE_ENV,
    fetchImpl: async () => jsonResponse(200, { id: USER_A }),
  });
  assert.equal(authUser.userId, USER_A);
});
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

test('statusNoCreditReturnsSuccess', async () => {
  const body = await statusForUser(makeStore(), USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.deepEqual(body.activeCredits, []);
});

test('statusNoOrdersReturnsSuccess', async () => {
  const body = await statusForUser(makeStore(), USER_A);
  assert.deepEqual(body.pendingOrders, []);
  assert.deepEqual(body.paidOrders, []);
});

test('statusShowsNoCreditBeforePayment', async () => {
  const store = makeStore();
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.deepEqual(body.activeCredits, []);
  assert.deepEqual(body.pendingOrders, []);
  assert.deepEqual(body.paidOrders, []);
});

test('creditsEmptyArrayIsNotError', async () => {
  const body = await statusForUser(makeSupabaseStatusStore({ credits: [], orders: [] }), USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.deepEqual(body.activeCredits, []);
});

test('ordersEmptyArrayIsNotError', async () => {
  const body = await statusForUser(makeSupabaseStatusStore({ credits: [], orders: [] }), USER_A);
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

test('activeCreditShowsUnlocked', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  await runPaidWebhook(store, store.state.orders[0]);
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, true);
  assert.equal(body.activeCredits.length, 1);
  assert.equal(body.activeCredits[0].analysisLimit, 50);
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

test('pendingOrderShowsConfirmation', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.equal(body.pendingOrders.length, 1);
  assert.equal(body.pendingOrders[0].status, 'pending');
});

test('pendingOrderShowsPaymentInConfirmation', async () => {
  const store = makeStore();
  await createCheckout(store, USER_A);
  const body = await statusForUser(store, USER_A);
  assert.equal(body.hasActiveCredit, false);
  assert.equal(body.pendingOrders.length, 1);
  assert.equal(body.pendingOrders[0].status, 'pending');
});

test('statusMissingSupabaseUrlHasSpecificDebugCode', async () => {
  const handler = statusModule.createHandler({
    env: { SUPABASE_SERVICE_ROLE_KEY: 'service_role_key_not_printed' },
    authenticateRequest: async () => ({ userId: USER_A }),
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 500);
  assert.equal(body.debugCode, 'missing_supabase_url');
});

test('statusMissingSupabaseServiceRoleKeyHasSpecificDebugCode', async () => {
  const handler = statusModule.createHandler({
    env: { SUPABASE_URL: 'https://supabase.example.test' },
    authenticateRequest: async () => ({ userId: USER_A }),
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 500);
  assert.equal(body.debugCode, 'missing_supabase_service_role_key');
});
test('statusQueryFailureHasSpecificDebugCode', async () => {
  const { response, body } = await statusResponseForUser(makeSupabaseStatusStore({ failCredits: true }), USER_A);
  assert.equal(response.statusCode, 500);
  assert.equal(body.debugCode, 'credits_query_failed');
});

test('noUnexpectedErrorForEmptyState', async () => {
  const { response, body } = await statusResponseForUser(makeSupabaseStatusStore({ credits: [], orders: [] }), USER_A);
  assert.equal(response.statusCode, 200);
  assert.equal(body.debugCode, undefined);
  assert.equal(body.hasActiveCredit, false);
});

test('checkoutStillAvailableWhenNoCredit', async () => {
  const store = makeStore();
  const status = await statusForUser(store, USER_A);
  assert.equal(status.hasActiveCredit, false);
  const checkout = await createCheckout(store, USER_A);
  assert.ok(checkout.checkoutUrl.startsWith('https://sandbox.asaas.com/checkoutSession/show/chk_'));
});

test('noGenericErrorWithoutDebugCode', async () => {
  const handler = statusModule.createHandler({
    paymentOrders: makeStore(),
    authenticateRequest: async () => { throw new Error('boom'); },
  });
  const response = await handler({ httpMethod: 'GET' });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 500);
  assert.equal(body.debugCode, 'status_unexpected_error');
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