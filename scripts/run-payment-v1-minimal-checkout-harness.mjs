import assert from 'node:assert/strict';

const HMLG_ORIGIN = 'https://hmlg.vistoriafacil-ia.com.br';
const PROD_ORIGIN = 'https://vistoriafacil-ia.com.br';

const envFixture = {
  ASAAS_ENV: 'sandbox',
  ASAAS_API_KEY: 'test_api_key_not_printed',
  APP_PUBLIC_ORIGIN: HMLG_ORIGIN,
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
  assert.equal(typeof functionModule.resolvePaymentV1ReturnCallback, 'function');
});

test('hmlgAppPublicOriginBuildsReturnUrls', () => {
  const callback = functionModule.resolvePaymentV1ReturnCallback(HMLG_ORIGIN, {
    env: { APP_PUBLIC_ORIGIN: `${HMLG_ORIGIN}/` },
  });
  assert.deepEqual(callback, {
    successUrl: `${HMLG_ORIGIN}/?payment=success`,
    cancelUrl: `${HMLG_ORIGIN}/?payment=cancel`,
    expiredUrl: `${HMLG_ORIGIN}/?payment=expired`,
  });
});

test('productionAppPublicOriginBuildsReturnUrls', () => {
  const callback = functionModule.resolvePaymentV1ReturnCallback(PROD_ORIGIN, {
    env: { APP_PUBLIC_ORIGIN: PROD_ORIGIN },
  });
  assert.deepEqual(callback, {
    successUrl: `${PROD_ORIGIN}/?payment=success`,
    cancelUrl: `${PROD_ORIGIN}/?payment=cancel`,
    expiredUrl: `${PROD_ORIGIN}/?payment=expired`,
  });
});

test('missingAppPublicOriginFailsClosed', () => {
  assert.throws(
    () => functionModule.resolvePaymentV1ReturnCallback(HMLG_ORIGIN, { env: {} }),
    (error) => error.debugCode === 'missing_app_public_origin' && error.statusCode === 500
  );
});

test('unknownReturnOriginRejected', () => {
  assert.throws(
    () => functionModule.resolvePaymentV1ReturnCallback('https://attacker.example.test', { env: { APP_PUBLIC_ORIGIN: HMLG_ORIGIN } }),
    (error) => error.debugCode === 'invalid_return_origin' && error.statusCode === 400
  );
});

test('invalidAppPublicOriginRejected', () => {
  assert.throws(
    () => functionModule.resolvePaymentV1ReturnCallback(HMLG_ORIGIN, { env: { APP_PUBLIC_ORIGIN: 'http://hmlg.vistoriafacil-ia.com.br' } }),
    (error) => error.debugCode === 'invalid_app_public_origin' && error.statusCode === 500
  );
});

test('missingReturnOriginRejected', () => {
  assert.throws(
    () => functionModule.resolvePaymentV1ReturnCallback(undefined, { env: { APP_PUBLIC_ORIGIN: HMLG_ORIGIN } }),
    (error) => error.debugCode === 'missing_return_origin' && error.statusCode === 400
  );
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

test('checkoutPayloadUsesEnvCallbackFallback', async () => {
  let payload;
  await clientModule.createAsaasCheckout({
    plan: plan50,
    env: envFixture,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return jsonResponse(200, { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' });
    },
  });
  assert.deepEqual(payload.callback, {
    successUrl: envFixture.ASAAS_SUCCESS_URL,
    cancelUrl: envFixture.ASAAS_CANCEL_URL,
    expiredUrl: envFixture.ASAAS_EXPIRED_URL,
  });
});

test('checkoutPayloadUsesValidatedReturnOriginCallback', async () => {
  let payload;
  const callback = functionModule.resolvePaymentV1ReturnCallback(HMLG_ORIGIN, { env: envFixture });
  await clientModule.createAsaasCheckout({
    plan: plan50,
    env: {
      ASAAS_ENV: 'sandbox',
      ASAAS_API_KEY: 'test_api_key_not_printed',
    },
    callback,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return jsonResponse(200, { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' });
    },
  });
  assert.deepEqual(payload.callback, callback);
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
    env: envFixture,
    authenticateRequest: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }),
    asaasClient: {
      async createAsaasCheckout({ plan, externalReference }) {
        assert.equal(plan.code, 'report_50_beta');
        assert.ok(externalReference.startsWith('vf-payment-v1-report_50_beta-'));
        return { checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_fn', checkoutId: 'chk_fn', planCode: plan.code };
      },
    },
  });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ planCode: 'report_50_beta', returnOrigin: HMLG_ORIGIN }) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show/chk_fn');
  assert.equal(body.checkoutId, 'chk_fn');
  assert.equal(body.orderId, 'order_1');
  assert.equal(body.planCode, 'report_50_beta');
});

test('functionPassesValidatedReturnOriginCallbackToAsaas', async () => {
  const paymentOrders = makeMockPaymentOrders();
  let receivedCallback;
  const handler = functionModule.createHandler({
    paymentOrders,
    env: envFixture,
    authenticateRequest: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }),
    asaasClient: {
      async createAsaasCheckout({ plan, callback }) {
        receivedCallback = callback;
        return { checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_fn', checkoutId: 'chk_fn', planCode: plan.code };
      },
    },
  });
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      planCode: 'report_50_beta',
      returnOrigin: HMLG_ORIGIN,
    }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(receivedCallback.successUrl, `${HMLG_ORIGIN}/?payment=success`);
});

test('functionRejectsInvalidReturnOriginBeforeOrderCreation', async () => {
  const paymentOrders = makeMockPaymentOrders();
  const handler = functionModule.createHandler({
    paymentOrders,
    env: envFixture,
    authenticateRequest: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }),
    asaasClient: {
      async createAsaasCheckout() {
        throw new Error('asaas should not be called');
      },
    },
  });
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ planCode: 'report_50_beta', returnOrigin: 'https://attacker.example.test' }),
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 400);
  assert.equal(body.debugCode, 'invalid_return_origin');
  assert.equal(paymentOrders.orders.length, 0);
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
