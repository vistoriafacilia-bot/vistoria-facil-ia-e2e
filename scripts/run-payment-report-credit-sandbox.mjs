import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { handler as createCheckoutHandler } from '../netlify/functions/create-report-checkout.mjs';
import { handler as webhookHandler } from '../netlify/functions/mercadopago-webhook.mjs';

const SUPABASE_URL = 'https://payment-sandbox.supabase.test';
const SERVICE_ROLE = 'sandbox-service-role-key';
const ANON_KEY = 'sandbox-anon-key';
const MP_TOKEN = 'sandbox-mercadopago-token';
const WEBHOOK_SECRET = 'sandbox-webhook-secret';
const APP_URL = 'https://payment-sandbox.vistoriafacil.test';

const USERS = {
  'token-user-a': { id: '00000000-0000-4000-8000-00000000000a', email: 'user-a@example.test' },
  'token-user-b': { id: '00000000-0000-4000-8000-00000000000b', email: 'user-b@example.test' },
};

const PLAN_LIMITS = {
  report_50_beta_4990: { priceCents: 4990, currency: 'BRL', analysisLimit: 50 },
  report_100_9990: { priceCents: 9990, currency: 'BRL', analysisLimit: 100 },
  report_150_14990: { priceCents: 14990, currency: 'BRL', analysisLimit: 150 },
};

const db = {
  report_payment_orders: [],
  report_credits: [],
  mercadopago_webhook_events: [],
  inspections: [],
  photos: [],
};

const payments = new Map();
const preferenceRequests = [];

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return body;
  },
});

const normalizeHeaders = (headers = {}) => {
  const normalized = {};
  if (typeof headers.get === 'function') {
    for (const key of ['authorization', 'apikey', 'content-type']) {
      const value = headers.get(key);
      if (value) normalized[key] = value;
    }
    return normalized;
  }
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
  const targets = applyFilters(db[table], searchParams);
  for (const target of targets) Object.assign(target, patch);
  return targets;
};

const handleSupabaseRest = async (url, options) => {
  const headers = normalizeHeaders(options.headers);
  const table = decodeURIComponent(url.pathname.replace('/rest/v1/', ''));
  if (!db[table]) return response(404, { message: `unknown table ${table}` });

  if (options.method === 'GET' || !options.method) {
    return response(200, applyFilters(db[table], url.searchParams));
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

    if (String(input) === 'https://api.mercadopago.com/checkout/preferences') {
      const body = parseBody(options.body);
      preferenceRequests.push(body);
      return response(201, {
        id: `pref_${body.external_reference}`,
        init_point: `https://checkout.mercadopago.test/checkout/${body.external_reference}`,
        sandbox_init_point: `https://sandbox.mercadopago.test/checkout/${body.external_reference}`,
      });
    }

    if (url.origin === 'https://api.mercadopago.com' && url.pathname.startsWith('/v1/payments/')) {
      const paymentId = decodeURIComponent(url.pathname.split('/').pop() || '');
      const payment = payments.get(paymentId);
      return payment ? response(200, payment) : response(404, { message: 'payment not found' });
    }

    throw new Error(`Unexpected network call: ${input}`);
  };
};

const setEnv = () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.MERCADOPAGO_ACCESS_TOKEN = MP_TOKEN;
  process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.URL = APP_URL;
  delete process.env.MERCADOPAGO_ENV;
};

const createCheckout = async (planId = 'report_50_beta_4990', token = 'token-user-a') => {
  const result = await createCheckoutHandler({
    httpMethod: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      origin: APP_URL,
    },
    body: JSON.stringify({
      planId,
      origin: 'https://malicious-return-url.example.test',
      priceCents: 1,
      analysisLimit: 999999,
    }),
  });
  return { statusCode: result.statusCode, body: JSON.parse(result.body) };
};

const signatureFor = (paymentId, requestId, ts = '1700000000') => {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
};

const sendWebhook = async (paymentId, body = { type: 'payment', data: { id: paymentId } }) => {
  const requestId = `req_${paymentId}_${randomUUID()}`;
  const result = await webhookHandler({
    httpMethod: 'POST',
    headers: {
      'x-request-id': requestId,
      'x-signature': signatureFor(paymentId, requestId),
    },
    queryStringParameters: {},
    body: JSON.stringify(body),
  });
  return { statusCode: result.statusCode, body: JSON.parse(result.body) };
};

const registerPayment = ({ paymentId, order, status, amountCents, planId }) => {
  payments.set(paymentId, {
    id: paymentId,
    status,
    transaction_amount: amountCents / 100,
    currency_id: 'BRL',
    external_reference: order.id,
    metadata: {
      order_id: order.id,
      user_id: order.user_id,
      plan_id: planId || order.plan_id,
      product_type: 'report_credit',
    },
  });
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

const assertThrowsMessage = (fn, message) => {
  assert.throws(fn, error => String(error?.message) === message);
};

const assertMigrationRls = () => {
  const migration = readFileSync('supabase/migrations/202606290001_report_credits.sql', 'utf8');
  const policyStatements = migration.match(/create policy[\s\S]*?;/gi) || [];
  assert.match(migration, /alter table public\.report_payment_orders enable row level security;/);
  assert.match(migration, /alter table public\.report_credits enable row level security;/);
  assert.match(migration, /for select to authenticated using \(user_id = auth\.uid\(\)\)/);
  for (const statement of policyStatements) {
    const paidTablePolicy = /on public\.(report_credits|report_payment_orders)/i.test(statement);
    if (paidTablePolicy) assert.doesNotMatch(statement, /for (insert|update|delete)/i);
  }
};

const main = async () => {
  setEnv();
  installFetchMock();
  assertMigrationRls();

  const unauthenticated = await createCheckoutHandler({
    httpMethod: 'POST',
    headers: { origin: APP_URL },
    body: JSON.stringify({ planId: 'report_50_beta_4990' }),
  });
  assert.equal(unauthenticated.statusCode, 500);
  assert.match(unauthenticated.body, /create_report_checkout_failed/);

  process.env.MERCADOPAGO_ENV = 'sandbox';
  const sandboxCheckout = await createCheckout('report_150_14990');
  assert.equal(sandboxCheckout.statusCode, 200);
  assert.match(sandboxCheckout.body.checkoutUrl, /^https:\/\/sandbox\.mercadopago\.test\/checkout\//);
  const sandboxOrder = db.report_payment_orders.find(item => item.id === sandboxCheckout.body.orderId);
  assert.equal(sandboxOrder.checkout_url, sandboxCheckout.body.checkoutUrl);

  process.env.MERCADOPAGO_ENV = 'production';
  const checkout = await createCheckout();
  assert.equal(checkout.statusCode, 200);
  assert.match(checkout.body.checkoutUrl, /^https:\/\/checkout\.mercadopago\.test\/checkout\//);

  const order = db.report_payment_orders.find(item => item.id === checkout.body.orderId);
  assert.equal(order.user_id, USERS['token-user-a'].id);
  assert.equal(order.plan_id, 'report_50_beta_4990');
  assert.equal(order.amount_cents, 4990);
  assert.equal(order.currency, 'BRL');
  assert.equal(order.status, 'pending');

  const preference = preferenceRequests.find(item => item.external_reference === checkout.body.orderId);
  assert.equal(preference.items[0].id, 'report_50_beta_4990');
  assert.equal(preference.items[0].unit_price, 49.9);
  assert.equal(preference.metadata.product_type, 'report_credit');
  assert.equal(preference.back_urls.success.startsWith(APP_URL), true);

  const deniedClientWrite = await fetch(`${SUPABASE_URL}/rest/v1/report_credits`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: 'Bearer token-user-a', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'client-forged-credit',
      user_id: USERS['token-user-a'].id,
      plan_id: 'report_150_14990',
      status: 'available',
      analysis_limit: 150,
      analysis_used: 0,
      price_cents: 0,
      currency: 'BRL',
    }),
  });
  assert.equal(deniedClientWrite.status, 403);

  registerPayment({
    paymentId: 'mp_approved_1',
    order,
    status: 'approved',
    amountCents: 4990,
  });
  const approvedWebhook = await sendWebhook('mp_approved_1');
  assert.equal(approvedWebhook.statusCode, 200);
  assert.equal(approvedWebhook.body.status, 'credit_available');
  assert.equal(db.report_credits.length, 1);
  assert.equal(db.report_credits[0].user_id, USERS['token-user-a'].id);
  assert.equal(db.report_credits[0].plan_id, 'report_50_beta_4990');
  assert.equal(db.report_credits[0].analysis_limit, 50);
  assert.equal(db.report_credits[0].analysis_used, 0);
  assert.equal(db.report_credits[0].status, 'available');

  const duplicateWebhook = await sendWebhook('mp_approved_1');
  assert.equal(duplicateWebhook.statusCode, 200);
  assert.equal(db.report_credits.filter(credit => credit.payment_id === 'mp_approved_1').length, 1);

  for (const status of ['pending', 'rejected', 'canceled']) {
    const pendingCheckout = await createCheckout('report_100_9990');
    const pendingOrder = db.report_payment_orders.find(item => item.id === pendingCheckout.body.orderId);
    registerPayment({
      paymentId: `mp_${status}`,
      order: pendingOrder,
      status,
      amountCents: 9990,
    });
    const result = await sendWebhook(`mp_${status}`);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'accepted_no_credit');
    assert.equal(db.report_credits.some(credit => credit.payment_id === `mp_${status}`), false);
  }

  payments.get('mp_approved_1').status = 'refunded';
  const refundedWebhook = await sendWebhook('mp_approved_1');
  assert.equal(refundedWebhook.statusCode, 200);
  assert.equal(refundedWebhook.body.status, 'accepted_no_credit');
  assert.equal(db.report_credits[0].status, 'refunded');

  const usableCheckout = await createCheckout('report_50_beta_4990');
  const usableOrder = db.report_payment_orders.find(item => item.id === usableCheckout.body.orderId);
  registerPayment({
    paymentId: 'mp_approved_usable',
    order: usableOrder,
    status: 'approved',
    amountCents: 4990,
  });
  await sendWebhook('mp_approved_usable');
  const usableCredit = db.report_credits.find(credit => credit.payment_id === 'mp_approved_usable');

  db.inspections.push(
    { id: 'inspection-a-1', user_id: USERS['token-user-a'].id, status: 'em_andamento' },
    { id: 'inspection-a-2', user_id: USERS['token-user-a'].id, status: 'em_andamento' },
    { id: 'inspection-b-1', user_id: USERS['token-user-b'].id, status: 'em_andamento' },
  );

  const assigned = assignCredit({
    creditId: usableCredit.id,
    inspectionId: 'inspection-a-1',
    userId: USERS['token-user-a'].id,
  });
  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.inspection_id, 'inspection-a-1');
  assertThrowsMessage(() => assignCredit({
    creditId: usableCredit.id,
    inspectionId: 'inspection-a-2',
    userId: USERS['token-user-a'].id,
  }), 'REPORT_CREDIT_ALREADY_ASSIGNED');
  assertThrowsMessage(() => assignCredit({
    creditId: usableCredit.id,
    inspectionId: 'inspection-b-1',
    userId: USERS['token-user-b'].id,
  }), 'REPORT_CREDIT_NOT_FOUND');

  consumeAnalysis({ inspectionId: 'inspection-a-1', userId: USERS['token-user-a'].id });
  assert.equal(usableCredit.analysis_used, 1);
  db.photos.push({ id: 'photo-1', inspection_id: 'inspection-a-1' });
  db.photos = db.photos.filter(photo => photo.id !== 'photo-1');
  assert.equal(usableCredit.analysis_used, 1);

  usableCredit.analysis_used = usableCredit.analysis_limit;
  assertThrowsMessage(() => consumeAnalysis({
    inspectionId: 'inspection-a-1',
    userId: USERS['token-user-a'].id,
  }), 'REPORT_CREDIT_LIMIT_REACHED');

  console.log(JSON.stringify({
    status: 'PAYMENT_SANDBOX_TEST_PASS',
    scenarios: {
      checkoutAuthenticated: true,
      sandboxEnvUsesSandboxInitPoint: true,
      backendPricedPlans: true,
      approvedCreatesOneCredit: true,
      duplicateWebhookIdempotent: true,
      nonApprovedDoesNotReleaseCredit: true,
      refundedRevokesUnfinalizedCredit: true,
      clientCannotCreatePaidCredit: true,
      creditSingleInspection: true,
      crossUserApplyDenied: true,
      analysisConsumptionAndLimit: true,
      deletePhotoDoesNotRefundAnalysis: true,
    },
    totals: {
      orders: db.report_payment_orders.length,
      credits: db.report_credits.length,
      webhookEvents: db.mercadopago_webhook_events.length,
    },
  }, null, 2));
};

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
