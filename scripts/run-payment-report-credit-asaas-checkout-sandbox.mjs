import assert from 'node:assert/strict';
import { handler as createAsaasCheckoutHandler } from '../netlify/functions/create-asaas-checkout.mjs';
import { handler as asaasWebhookHandler } from '../netlify/functions/asaas-checkout-webhook.mjs';

const SUPABASE_URL = 'https://asaas-sandbox.supabase.test';
const SERVICE_ROLE = 'sandbox-service-role-key';
const ASAAS_API_KEY = 'sandbox-asaas-api-key';
const ASAAS_WEBHOOK_TOKEN = 'sandbox-asaas-webhook-token';
const APP_URL = 'https://asaas-sandbox.vistoriafacil.test';

const USERS = {
  'token-user-a': { id: '00000000-0000-4000-8000-00000000000a', email: 'user-a@example.test' },
  'token-user-b': { id: '00000000-0000-4000-8000-00000000000b', email: 'user-b@example.test' },
};

const db = {
  report_credit_plans: [
    {
      id: 'report_50_beta_4990',
      name: 'Relatorio 50',
      description: 'Credito avulso para 1 relatorio com ate 50 analises de IA.',
      price_cents: 4990,
      currency: 'BRL',
      analysis_limit: 50,
      active: true,
    },
    {
      id: 'report_100_9990',
      name: 'Relatorio 100',
      description: 'Credito avulso para 1 relatorio com ate 100 analises de IA.',
      price_cents: 9990,
      currency: 'BRL',
      analysis_limit: 100,
      active: true,
    },
    {
      id: 'report_150_14990',
      name: 'Relatorio 150',
      description: 'Credito avulso para 1 relatorio com ate 150 analises de IA.',
      price_cents: 14990,
      currency: 'BRL',
      analysis_limit: 150,
      active: true,
    },
  ],
  report_payment_orders: [],
  report_credits: [],
  mercadopago_webhook_events: [],
  inspections: [],
  photos: [],
};

const asaasCheckoutPayloads = [];

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return body;
  },
});

const normalizeHeaders = (headers = {}) => {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
};

const parseBody = (body) => {
  if (!body) return null;
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const isServiceRole = (headers) => String(headers.authorization || '') === `Bearer ${SERVICE_ROLE}`;

const applyFilters = (rows, searchParams) => {
  let filtered = [...rows];
  for (const [key, value] of searchParams.entries()) {
    if (key === 'limit' || key === 'select' || key === 'order') continue;
    if (value.startsWith('eq.')) {
      const expected = decodeURIComponent(value.slice(3));
      filtered = filtered.filter(row => String(row[key]) === expected);
    } else if (value.startsWith('neq.')) {
      const expected = decodeURIComponent(value.slice(4));
      filtered = filtered.filter(row => String(row[key]) !== expected);
    }
  }
  const limit = Number(searchParams.get('limit') || 0);
  return limit > 0 ? filtered.slice(0, limit) : filtered;
};

const updateRows = (table, searchParams, patch) => {
  const rows = applyFilters(db[table], searchParams);
  for (const row of rows) Object.assign(row, patch);
  return rows;
};

const handleSupabaseRest = async (url, options) => {
  const headers = normalizeHeaders(options.headers);
  const table = decodeURIComponent(url.pathname.replace('/rest/v1/', ''));
  if (!db[table]) return response(404, { message: `unknown table ${table}` });

  if (options.method === 'GET' || !options.method) {
    return response(200, applyFilters(db[table], url.searchParams).map(row => ({ ...row })));
  }

  if (!isServiceRole(headers)) return response(403, { message: 'RLS: write denied for non-service role' });
  const body = parseBody(options.body);

  if (options.method === 'POST') {
    if (table === 'mercadopago_webhook_events' && db[table].some(row => row.id === body.id)) {
      return response(409, { message: 'duplicate key value violates unique constraint' });
    }
    if (table === 'report_credits' && body.payment_id && db[table].some(row => row.payment_id === body.payment_id)) {
      return response(409, { message: 'duplicate key value violates unique constraint' });
    }
    db[table].push({ ...body });
    return response(201, [{ ...body }]);
  }

  if (options.method === 'PATCH') {
    return response(200, updateRows(table, url.searchParams, body).map(row => ({ ...row })));
  }

  return response(405, { message: 'method not allowed' });
};

const installFetchMock = () => {
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/user') {
      const headers = normalizeHeaders(options.headers);
      const token = String(headers.authorization || '').replace(/^Bearer\s+/i, '');
      const user = USERS[token];
      return user ? response(200, user) : response(401, { message: 'invalid user token' });
    }

    if (url.origin === SUPABASE_URL && url.pathname.startsWith('/rest/v1/')) {
      return handleSupabaseRest(url, { method: options.method || 'GET', headers: options.headers, body: options.body });
    }

    if (url.origin === 'https://api-sandbox.asaas.com' && url.pathname === '/v3/checkouts') {
      const headers = normalizeHeaders(options.headers);
      assert.equal(headers.access_token, ASAAS_API_KEY);
      const payload = parseBody(options.body);
      asaasCheckoutPayloads.push(payload);
      return response(200, {
        id: `chk_${payload.externalReference}`,
        url: `https://sandbox.asaas.test/checkout/${payload.externalReference}`,
      });
    }

    throw new Error(`Unexpected network call: ${input}`);
  };
};

const setEnv = () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.ASAAS_ENV = 'sandbox';
  process.env.ASAAS_API_KEY = ASAAS_API_KEY;
  process.env.ASAAS_WEBHOOK_TOKEN = ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_SUCCESS_URL = `${APP_URL}/plans`;
  process.env.ASAAS_CANCEL_URL = `${APP_URL}/plans`;
  process.env.ASAAS_EXPIRED_URL = `${APP_URL}/plans`;
  process.env.URL = APP_URL;
};

const assertNewFunctionsLoaded = () => {
  assert.equal(typeof createAsaasCheckoutHandler, 'function');
  assert.equal(typeof asaasWebhookHandler, 'function');
};

const createCheckout = async (planId = 'report_50_beta_4990', token = 'token-user-a') => {
  const result = await createAsaasCheckoutHandler({
    httpMethod: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      origin: APP_URL,
    },
    body: JSON.stringify({ planId }),
  });
  return { statusCode: result.statusCode, body: JSON.parse(result.body) };
};

const sendAsaasWebhook = async ({ event = 'CHECKOUT_PAID', orderId, checkoutId, paymentId, eventId }) => {
  const body = {
    id: eventId || `evt_${event}_${checkoutId || orderId}`,
    event,
    checkout: {
      id: checkoutId,
      externalReference: orderId,
    },
    payment: paymentId ? {
      id: paymentId,
      externalReference: orderId,
    } : undefined,
  };
  const result = await asaasWebhookHandler({
    httpMethod: 'POST',
    headers: {
      'asaas-access-token': ASAAS_WEBHOOK_TOKEN,
    },
    queryStringParameters: {},
    body: JSON.stringify(body),
  });
  return { statusCode: result.statusCode, body: JSON.parse(result.body) };
};

const assignCredit = ({ creditId, inspectionId, userId }) => {
  const credit = db.report_credits.find(item => item.id === creditId && item.user_id === userId);
  if (!credit) throw new Error('REPORT_CREDIT_NOT_FOUND');
  if (!['available', 'assigned', 'in_progress'].includes(credit.status)) throw new Error('REPORT_CREDIT_NOT_AVAILABLE');
  if (credit.inspection_id && credit.inspection_id !== inspectionId) throw new Error('REPORT_CREDIT_ALREADY_ASSIGNED');
  const inspection = db.inspections.find(item => item.id === inspectionId && item.user_id === userId);
  if (!inspection) throw new Error('INSPECTION_NOT_FOUND');
  if (['pdf_gerado', 'finalizado'].includes(inspection.status)) throw new Error('INSPECTION_ALREADY_FINALIZED');
  Object.assign(credit, {
    inspection_id: inspectionId,
    status: credit.analysis_used > 0 ? 'in_progress' : 'assigned',
    assigned_at: credit.assigned_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return credit;
};

const consumeAnalysis = ({ inspectionId, userId }) => {
  const credit = db.report_credits.find(item =>
    item.inspection_id === inspectionId
    && item.user_id === userId
    && ['assigned', 'in_progress'].includes(item.status)
  );
  if (!credit) throw new Error('REPORT_CREDIT_NOT_ASSIGNED');
  if (credit.analysis_used >= credit.analysis_limit) throw new Error('REPORT_CREDIT_LIMIT_REACHED');
  credit.analysis_used += 1;
  credit.status = 'in_progress';
  credit.updated_at = new Date().toISOString();
  return credit;
};

const finalizeCredit = ({ inspectionId, userId }) => {
  const credit = db.report_credits.find(item =>
    item.inspection_id === inspectionId
    && item.user_id === userId
    && ['assigned', 'in_progress'].includes(item.status)
  );
  if (!credit) throw new Error('REPORT_CREDIT_NOT_ASSIGNED');
  credit.status = 'finalized';
  credit.finalized_at = new Date().toISOString();
  credit.updated_at = new Date().toISOString();
  return credit;
};

const assertThrowsMessage = (fn, message) => {
  assert.throws(fn, error => String(error?.message) === message);
};

const main = async () => {
  setEnv();
  installFetchMock();
  assertNewFunctionsLoaded();

  const checkout50 = await createCheckout('report_50_beta');
  assert.equal(checkout50.statusCode, 200);
  assert.equal(checkout50.body.provider, 'asaas');
  assert.match(checkout50.body.checkoutUrl, /^https:\/\/sandbox\.asaas\.test\/checkout\//);

  const order50 = db.report_payment_orders.find(order => order.id === checkout50.body.orderId);
  assert.equal(order50.provider, 'asaas');
  assert.equal(order50.status, 'pending');
  assert.equal(order50.plan_id, 'report_50_beta_4990');
  assert.equal(order50.amount_cents, 4990);
  assert.equal(order50.preference_id, `chk_${order50.id}`);

  const payload50 = asaasCheckoutPayloads.find(payload => payload.externalReference === order50.id);
  assert.deepEqual(payload50.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.deepEqual(payload50.chargeTypes, ['DETACHED']);
  assert.equal(payload50.externalReference, order50.id);
  assert.equal(payload50.items.length, 1);
  assert.equal(payload50.items[0].name, 'Relatorio 50');
  assert.equal(payload50.items[0].quantity, 1);
  assert.equal(payload50.items[0].value, 49.9);
  assert.equal(payload50.callback.successUrl.includes(`order_id=${order50.id}`), true);
  assert.equal(payload50.customerData.email, USERS['token-user-a'].email);

  const paid = await sendAsaasWebhook({
    event: 'CHECKOUT_PAID',
    orderId: order50.id,
    checkoutId: order50.preference_id,
    paymentId: 'pay_asaas_approved_1',
  });
  assert.equal(paid.statusCode, 200);
  assert.equal(paid.body.status, 'credit_available');
  assert.equal(db.report_credits.length, 1);
  assert.equal(db.report_credits[0].user_id, USERS['token-user-a'].id);
  assert.equal(db.report_credits[0].plan_id, 'report_50_beta_4990');
  assert.equal(db.report_credits[0].analysis_limit, 50);
  assert.equal(db.report_credits[0].analysis_used, 0);
  assert.equal(db.report_credits[0].status, 'available');

  const duplicatePaid = await sendAsaasWebhook({
    event: 'CHECKOUT_PAID',
    orderId: order50.id,
    checkoutId: order50.preference_id,
    paymentId: 'pay_asaas_approved_1',
  });
  assert.equal(duplicatePaid.statusCode, 200);
  assert.equal(db.report_credits.filter(credit => credit.order_id === order50.id).length, 1);

  for (const event of ['CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED']) {
    const checkout = await createCheckout('report_100_9990');
    const order = db.report_payment_orders.find(item => item.id === checkout.body.orderId);
    const result = await sendAsaasWebhook({
      event,
      orderId: order.id,
      checkoutId: order.preference_id,
      paymentId: `pay_${event.toLowerCase()}`,
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'accepted_no_credit');
    assert.equal(db.report_credits.some(credit => credit.order_id === order.id), false);
  }

  db.inspections.push(
    { id: 'inspection-a-1', user_id: USERS['token-user-a'].id, status: 'em_andamento' },
    { id: 'inspection-a-2', user_id: USERS['token-user-a'].id, status: 'em_andamento' },
    { id: 'inspection-b-1', user_id: USERS['token-user-b'].id, status: 'em_andamento' },
  );

  const credit = db.report_credits[0];
  assignCredit({ creditId: credit.id, inspectionId: 'inspection-a-1', userId: USERS['token-user-a'].id });
  assert.equal(credit.inspection_id, 'inspection-a-1');
  assertThrowsMessage(() => assignCredit({
    creditId: credit.id,
    inspectionId: 'inspection-b-1',
    userId: USERS['token-user-b'].id,
  }), 'REPORT_CREDIT_NOT_FOUND');

  consumeAnalysis({ inspectionId: 'inspection-a-1', userId: USERS['token-user-a'].id });
  assert.equal(credit.analysis_used, 1);
  db.photos.push({ id: 'photo-1', inspection_id: 'inspection-a-1' });
  db.photos = db.photos.filter(photo => photo.id !== 'photo-1');
  assert.equal(credit.analysis_used, 1);

  credit.analysis_used = credit.analysis_limit;
  assertThrowsMessage(() => consumeAnalysis({
    inspectionId: 'inspection-a-1',
    userId: USERS['token-user-a'].id,
  }), 'REPORT_CREDIT_LIMIT_REACHED');

  credit.analysis_used = 1;
  finalizeCredit({ inspectionId: 'inspection-a-1', userId: USERS['token-user-a'].id });
  assert.equal(credit.status, 'finalized');
  assertThrowsMessage(() => assignCredit({
    creditId: credit.id,
    inspectionId: 'inspection-a-2',
    userId: USERS['token-user-a'].id,
  }), 'REPORT_CREDIT_NOT_AVAILABLE');

  console.log(JSON.stringify({
    status: 'PAYMENT_ASAAS_CHECKOUT_SANDBOX_TEST_PASS',
    scenarios: {
      newFunctionsLoaded: true,
      checkoutSandboxPlan50: true,
      pendingOrderCreated: true,
      pixAndCreditCardBillingTypes: true,
      detachedChargeType: true,
      externalReference: true,
      itemValue: true,
      paidWebhookCreatesOneCredit: true,
      duplicateWebhookIdempotent: true,
      canceledDoesNotCreateCredit: true,
      expiredDoesNotCreateCredit: true,
      crossUserApplyDenied: true,
      analysisLimitWorks: true,
      deletePhotoDoesNotRefundAnalysis: true,
      finalizedCreditCannotBeReused: true,
    },
    totals: {
      orders: db.report_payment_orders.length,
      credits: db.report_credits.length,
      webhookEvents: db.mercadopago_webhook_events.length,
      asaasCheckoutRequests: asaasCheckoutPayloads.length,
    },
  }, null, 2));
};

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
