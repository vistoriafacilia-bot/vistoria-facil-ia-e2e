import assert from 'node:assert/strict';

const envFixture = {
  ASAAS_ENV: 'sandbox',
  ASAAS_API_KEY: 'test_api_key_not_printed',
  ASAAS_SUCCESS_URL: 'https://example.test/success',
  ASAAS_CANCEL_URL: 'https://example.test/cancel',
  ASAAS_EXPIRED_URL: 'https://example.test/expired',
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

const makeMockPaymentOrders = () => ({
  orders: [],
  async createPendingOrder({ plan, externalReference, userId }) {
    if (!userId) throw Object.assign(new Error('user required'), { debugCode: 'invalid_auth_token', statusCode: 401 });
    const order = {
      id: `order_${this.orders.length + 1}`,
      user_id: userId,
      plan_code: plan.code,
      external_reference: externalReference,
      status: 'pending',
      amount_cents: Math.round(plan.value * 100),
      analysis_limit: plan.analysisLimit,
    };
    this.orders.push(order);
    return order;
  },
  async updateOrderCheckout({ orderId, checkoutId, checkoutUrl }) {
    const order = this.orders.find((item) => item.id === orderId);
    Object.assign(order, { provider_checkout_id: checkoutId, checkout_url: checkoutUrl });
    return order;
  },
});

const plansModule = await import('../netlify/functions/_paymentV1/paymentPlans.mjs');
const clientModule = await import('../netlify/functions/_paymentV1/asaasClient.mjs');
const errorsModule = await import('../netlify/functions/_paymentV1/paymentErrors.mjs');
const functionModule = await import('../netlify/functions/payment-v1-create-checkout.mjs');

const plan50 = plansModule.getPaymentV1Plan('report_50_beta');

test('paymentV1ModulesLoad', () => {
  assert.equal(typeof clientModule.createAsaasCheckout, 'function');
  assert.equal(typeof errorsModule.PaymentV1Error, 'function');
  assert.equal(plan50.value, 49.9);
  assert.equal(typeof functionModule.createHandler, 'function');
});

test('sandboxEnvUsesSandboxBase', () => {
  const config = clientModule.resolveAsaasConfig(envFixture);
  assert.equal(config.baseUrl, 'https://api-sandbox.asaas.com/v3');
});

test('productionEnvUsesProductionBase', () => {
  const config = clientModule.resolveAsaasConfig({ ...envFixture, ASAAS_ENV: 'production' });
  assert.equal(config.baseUrl, 'https://api.asaas.com/v3');
});

test('invalidEnvFailsClosed', () => {
  assert.throws(() => clientModule.resolveAsaasConfig({ ...envFixture, ASAAS_ENV: 'staging' }), (error) => error.debugCode === 'asaas_env_invalid');
});

test('missingApiKeyFailsClosed', () => {
  assert.throws(() => clientModule.resolveAsaasConfig({ ...envFixture, ASAAS_API_KEY: '' }), (error) => error.debugCode === 'missing_asaas_api_key');
});

test('checkoutPayloadHasPixAndCreditCard', async () => {
  let payload;
  await clientModule.createAsaasCheckout({
    plan: plan50,
    env: envFixture,
    now: () => 123,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return jsonResponse(200, { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' });
    },
  });
  assert.deepEqual(payload.billingTypes, ['PIX', 'CREDIT_CARD']);
});

test('checkoutPayloadHasDetached', async () => {
  let payload;
  await clientModule.createAsaasCheckout({
    plan: plan50,
    env: envFixture,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return jsonResponse(200, { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' });
    },
  });
  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.items[0].name, 'Relatório 50');
  assert.equal(payload.items[0].value, 49.9);
});

test('checkoutUsesAccessTokenHeader', async () => {
  let headers;
  await clientModule.createAsaasCheckout({
    plan: plan50,
    env: envFixture,
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return jsonResponse(200, { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' });
    },
  });
  assert.equal(headers.access_token, envFixture.ASAAS_API_KEY);
  assert.equal(headers.authorization, undefined);
});

test('checkoutUsesResponseLink', async () => {
  const result = await clientModule.createAsaasCheckout({
    plan: plan50,
    env: envFixture,
    fetchImpl: async () => jsonResponse(200, { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/from-link' }),
  });
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show/from-link');
});

test('checkoutFallsBackToIdUrl', async () => {
  const result = await clientModule.createAsaasCheckout({
    plan: plan50,
    env: envFixture,
    fetchImpl: async () => jsonResponse(200, { id: 'chk_fallback' }),
  });
  assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show/chk_fallback');
});

test('checkoutMissingLinkAndIdFailsWithDebugCode', async () => {
  await assert.rejects(
    () => clientModule.createAsaasCheckout({ plan: plan50, env: envFixture, fetchImpl: async () => jsonResponse(200, { status: 'ok' }) }),
    (error) => error.debugCode === 'asaas_response_missing_id'
  );
});

test('functionReturnsCheckoutUrl', async () => {
  const paymentOrders = makeMockPaymentOrders();
  const handler = functionModule.createHandler({
    paymentOrders,
    authenticateRequest: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }),
    asaasClient: {
      async createAsaasCheckout({ plan, externalReference }) {
        assert.equal(plan.code, 'report_50_beta');
        assert.ok(externalReference.startsWith('vf-payment-v1-report_50_beta-'));
        return { checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_fn', checkoutId: 'chk_fn', planCode: plan.code };
      },
    },
  });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode: 'report_50_beta' }) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show/chk_fn');
  assert.equal(body.checkoutId, 'chk_fn');
  assert.equal(body.orderId, 'order_1');
  assert.equal(body.planCode, 'report_50_beta');
});

test('noGenericErrorWithoutDebugCode', async () => {
  const handler = functionModule.createHandler({
    paymentOrders: makeMockPaymentOrders(),
    authenticateRequest: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }),
  });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode: 'unknown' }) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 400);
  assert.equal(body.debugCode, 'plan_not_found');
  assert.ok(body.error);
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
