import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AdminError } from '../netlify/functions/_admin/adminErrors.mjs';
import { assertAdminPermission, authenticateAdminRequest, getBootstrapOwnerEmail } from '../netlify/functions/_admin/adminAuth.mjs';
import * as dashboardModule from '../netlify/functions/admin-dashboard.mjs';
import * as customersModule from '../netlify/functions/admin-customers.mjs';
import * as plansModule from '../netlify/functions/admin-plans.mjs';
import * as trialModule from '../netlify/functions/admin-trial.mjs';
import * as ordersModule from '../netlify/functions/admin-orders.mjs';
import * as creditsModule from '../netlify/functions/admin-credits.mjs';
import * as inspectionsModule from '../netlify/functions/admin-inspections.mjs';
import * as adminUsersModule from '../netlify/functions/admin-users.mjs';
import * as auditModule from '../netlify/functions/admin-audit.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const parseBody = (response) => JSON.parse(response.body || '{}');
const event = ({ method = 'GET', body = null, query = {} } = {}) => ({
  httpMethod: method,
  headers: { authorization: 'Bearer admin-token' },
  body: body ? JSON.stringify(body) : null,
  queryStringParameters: query,
});

const ownerAdmin = {
  id: 'admin-owner-1',
  user_id: 'auth-owner-1',
  email: 'owner@example.test',
  role: 'owner',
  active: true,
};

const authForRole = (role = 'owner') => async ({ requiredPermission }) => {
  const admin = { ...ownerAdmin, role };
  assertAdminPermission(admin, requiredPermission);
  return {
    admin,
    authUser: {
      userId: admin.user_id,
      email: admin.email,
    },
  };
};

const now = () => new Date().toISOString();

const makeStore = () => {
  const state = {
    dashboard: {
      metrics: { customers: 1, orders: 1, payments: 1, credits: 0, inspections: 1 },
      recentFailures: [{ type: 'payment', id: 'order-1', status: 'failed', updated_at: now() }],
    },
    customers: [{
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Cliente Teste',
      email: 'cliente@example.test',
      phone: '11987654321',
      admin_status: 'active',
      last_login_at: now(),
    }, {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Cliente Antigo',
      email: 'legacy@example.test',
      admin_status: 'active',
      last_login_at: now(),
    }],
    plans: [{
      id: 'report_admin_test',
      code: 'report_admin_test',
      name: 'Plano Admin Teste',
      description: 'Plano de teste vindo do banco fake',
      priceCents: 12345,
      currency: 'BRL',
      analysisLimit: 77,
      badge: 'Teste',
      active: true,
      visible: true,
      availableForPurchase: true,
      version: 1,
    }],
    trial: { enabled: true, photoLimit: 10 },
    entitlements: [{ id: 'existing-trial', user_id: '00000000-0000-4000-8000-000000000001', status: 'active', max_photos_per_inspection: 10 }],
    orders: [{ id: 'order-1', user_id: '00000000-0000-4000-8000-000000000001', plan_code: 'report_admin_test', status: 'paid', amount_cents: 12345, analysis_limit: 77 }],
    paymentCredits: [],
    inspections: [{ id: 'inspection-1', user_id: '00000000-0000-4000-8000-000000000001', status: 'finalizado', started_at: now() }],
    adminUsers: [ownerAdmin],
    audit: [],
    adjustments: [],
  };

  const audit = ({ admin, action, entityType, entityId, previousValue, nextValue, reason, result = 'success' }) => {
    const row = {
      id: `audit-${state.audit.length + 1}`,
      admin_email: admin?.email,
      admin_role: admin?.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      previous_value: previousValue,
      next_value: nextValue,
      reason,
      result,
      created_at: now(),
    };
    state.audit.push(row);
    return row;
  };

  const requireReason = (reason) => {
    if (!String(reason || '').trim()) throw new AdminError('Mutation reason is required.', { debugCode: 'admin_reason_required', statusCode: 400 });
    return String(reason).trim();
  };

  return {
    state,
    parseJsonBody: (body) => (body ? JSON.parse(body) : {}),
    async getDashboard() {
      return state.dashboard;
    },
    async listCustomers() {
      return state.customers;
    },
    async getCustomer(id) {
      const customer = state.customers.find((item) => item.id === id);
      if (!customer) throw new AdminError('Customer not found.', { debugCode: 'admin_customer_not_found', statusCode: 404 });
      return { customer, entitlements: state.entitlements, orders: state.orders, paymentCredits: state.paymentCredits, reportCredits: [], inspections: state.inspections, notes: [] };
    },
    async updateCustomerStatus({ customerId, status, reason, admin }) {
      const customer = state.customers.find((item) => item.id === customerId);
      const auditReason = requireReason(reason);
      audit({ admin, action: `customers.${status}`, entityType: 'profiles', entityId: customerId, previousValue: { ...customer }, nextValue: { ...customer, admin_status: status }, reason: auditReason });
      customer.admin_status = status;
      return customer;
    },
    async addCustomerNote({ customerId, note, reason, admin }) {
      const auditReason = requireReason(reason);
      audit({ admin, action: 'customers.note.create', entityType: 'admin_customer_notes', entityId: customerId, nextValue: { note }, reason: auditReason });
      return { id: 'note-1', note };
    },
    async sendPasswordReset({ email, customerId, reason, admin }) {
      const auditReason = requireReason(reason);
      audit({ admin, action: 'customers.password_reset.send', entityType: 'auth.users', entityId: customerId, nextValue: { email }, reason: auditReason });
      return { sent: true };
    },
    async listPlans() {
      return state.plans;
    },
    async createPlan({ body, admin }) {
      const reason = requireReason(body.reason);
      audit({ admin, action: 'plans.create', entityType: 'report_credit_plans', entityId: body.id, nextValue: body, reason });
      const plan = { ...body, version: 1 };
      state.plans.push(plan);
      return plan;
    },
    async updatePlan({ planId, body, admin }) {
      const plan = state.plans.find((item) => item.id === planId);
      const reason = requireReason(body.reason);
      audit({ admin, action: 'plans.update', entityType: 'report_credit_plans', entityId: planId, previousValue: { ...plan }, nextValue: { ...plan, ...body }, reason });
      Object.assign(plan, body, { version: plan.version + 1 });
      return plan;
    },
    async getTrialSettings() {
      return state.trial;
    },
    async updateTrialSettings({ enabled, photoLimit, reason, admin }) {
      const auditReason = requireReason(reason);
      audit({ admin, action: 'trial.update', entityType: 'app_settings', entityId: 'trial', previousValue: { ...state.trial }, nextValue: { enabled, photoLimit }, reason: auditReason });
      state.trial = { enabled, photoLimit };
      return state.trial;
    },
    async grantTrial({ customerId, photoLimit, reason, admin }) {
      const auditReason = requireReason(reason);
      const entitlement = { id: `trial-${state.entitlements.length + 1}`, user_id: customerId, status: 'active', max_photos_per_inspection: photoLimit };
      audit({ admin, action: 'trial.manual_grant', entityType: 'entitlements', entityId: customerId, nextValue: entitlement, reason: auditReason });
      state.entitlements.push(entitlement);
      return entitlement;
    },
    async listOrders() {
      return state.orders;
    },
    async getOrderBundle(orderId) {
      const order = state.orders.find((item) => item.id === orderId);
      const credits = state.paymentCredits.filter((credit) => credit.order_id === orderId);
      return { order, credits, events: [], approvedWithoutCredit: order?.status === 'paid' && credits.length === 0 };
    },
    async reprocessOrderEntitlement({ orderId, reason, admin }) {
      const auditReason = requireReason(reason);
      const bundle = await this.getOrderBundle(orderId);
      audit({ admin, action: 'orders.entitlement.reprocess', entityType: 'payment_v1_orders', entityId: orderId, previousValue: bundle, nextValue: { orderId }, reason: auditReason });
      if (bundle.order.status !== 'paid' || bundle.credits.length > 0) return { status: 'noop', credit: bundle.credits[0] || null };
      const credit = { id: 'credit-1', order_id: orderId, user_id: bundle.order.user_id, status: 'active', analysis_limit: bundle.order.analysis_limit, analysis_used: 0 };
      state.paymentCredits.push(credit);
      return { status: 'created', credit };
    },
    async getCreditSummary(customerId = '') {
      const rows = customerId ? state.paymentCredits.filter((credit) => credit.user_id === customerId) : state.paymentCredits;
      const manualPhotoLimits = state.entitlements.filter((item) => item.user_id === customerId && item.plan_id === 'admin_usage');
      return {
        customerId: customerId || null,
        photoUsage: {
          effectiveLimitPerInspection: Math.max(0, ...rows.map((credit) => credit.analysis_limit || 0), ...manualPhotoLimits.map((item) => item.max_photos_per_inspection || 0)),
          paymentCredits: rows,
          manualPhotoLimits,
        },
        reportUsage: { availableCredits: 0, reportCredits: [] },
      };
    },
    async adjustCredits({ customerId, action, usageUnits, creditId, creditTable, reason, admin }) {
      const previous = await this.getCreditSummary(customerId);
      const auditReason = requireReason(reason);
      if (action === 'grant') state.entitlements.push({ id: `manual-credit-${state.entitlements.length + 1}`, user_id: customerId, plan_id: 'admin_usage', status: 'active', max_photos_per_inspection: usageUnits });
      if (action === 'remove') {
        const credit = state.paymentCredits.find((item) => item.id === creditId);
        if (credit) credit.status = 'revoked';
      }
      const next = await this.getCreditSummary(customerId);
      audit({ admin, action: `credits.${action}`, entityType: creditTable || 'entitlements', entityId: creditId || customerId, previousValue: previous, nextValue: next, reason: auditReason, result: 'success' });
      state.adjustments.push({ previous_usage_units: previous.photoUsage.effectiveLimitPerInspection, next_usage_units: next.photoUsage.effectiveLimitPerInspection, reason: auditReason });
      return { adjustment: state.adjustments.at(-1), summary: next };
    },
    async listInspections() {
      return state.inspections;
    },
    async getInspection(id) {
      return { inspection: state.inspections.find((item) => item.id === id), photos: [{ id: 'photo-1', analysis_status: 'completed' }], reports: [{ id: 'report-1' }], reportCredits: [] };
    },
    async listAdminUsers() {
      return state.adminUsers;
    },
    async createAdminUser({ body, admin }) {
      const reason = requireReason(body.reason);
      audit({ admin, action: 'admin_users.create', entityType: 'admin_users', entityId: body.email, nextValue: body, reason });
      const row = { id: `admin-${state.adminUsers.length + 1}`, email: body.email, role: body.role, active: true };
      state.adminUsers.push(row);
      return row;
    },
    async updateAdminUser({ adminUserId, body, admin }) {
      const reason = requireReason(body.reason);
      const row = state.adminUsers.find((item) => item.id === adminUserId);
      audit({ admin, action: 'admin_users.update', entityType: 'admin_users', entityId: adminUserId, previousValue: { ...row }, nextValue: { ...row, ...body }, reason });
      Object.assign(row, body);
      return row;
    },
    async listAudit() {
      return state.audit;
    },
  };
};

const makeHandler = (module, store, role = 'owner', extra = {}) => module.createHandler({
  storeFactory: () => store,
  authenticateRequest: authForRole(role),
  ...extra,
});

test('authorizationDeniesReadOnlyMutation', async () => {
  const store = makeStore();
  const handler = makeHandler(plansModule, store, 'read_only');
  const response = await handler(event({ method: 'POST', body: { action: 'update', planId: 'report_admin_test', active: false, reason: 'controle' } }));
  const body = parseBody(response);
  assert.equal(response.statusCode, 403);
  assert.equal(body.debugCode, 'admin_permission_denied');
});

test('dashboardReturnsOperationalMetrics', async () => {
  const response = await makeHandler(dashboardModule, makeStore())(event());
  const body = parseBody(response);
  assert.equal(response.statusCode, 200);
  assert.equal(body.dashboard.metrics.customers, 1);
  assert.equal(body.dashboard.recentFailures.length, 1);
});

test('customerMutationRequiresReasonAndAudits', async () => {
  const store = makeStore();
  const handler = makeHandler(customersModule, store);
  const blocked = await handler(event({ method: 'POST', body: { action: 'set_status', customerId: stateCustomerId(store), status: 'blocked', reason: 'risco operacional' } }));
  assert.equal(blocked.statusCode, 200);
  assert.equal(store.state.customers[0].admin_status, 'blocked');
  assert.equal(store.state.audit.at(-1).action, 'customers.blocked');

  const rejected = await handler(event({ method: 'POST', body: { action: 'set_status', customerId: stateCustomerId(store), status: 'active' } }));
  assert.equal(rejected.statusCode, 400);
  assert.equal(parseBody(rejected).debugCode, 'admin_reason_required');
});

test('customerPhoneIsVisibleInAdminReadAndLegacyCustomerStillWorks', async () => {
  const store = makeStore();
  const handler = makeHandler(customersModule, store);
  const listResponse = await handler(event());
  const listBody = parseBody(listResponse);
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listBody.customers[0].phone, '11987654321');
  assert.equal(listBody.customers[1].phone, undefined);

  const detailResponse = await handler(event({ query: { id: stateCustomerId(store) } }));
  const detailBody = parseBody(detailResponse);
  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailBody.customer.customer.phone, '11987654321');
});

test('plansComeFromStoreAndPreserveVersionedAudit', async () => {
  const store = makeStore();
  const listResponse = await makeHandler(plansModule, store)(event());
  assert.equal(parseBody(listResponse).plans[0].priceCents, 12345);

  const updateResponse = await makeHandler(plansModule, store)(event({ method: 'POST', body: { action: 'update', planId: 'report_admin_test', active: false, reason: 'janela comercial' } }));
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(store.state.plans[0].active, false);
  assert.equal(store.state.plans[0].version, 2);
  assert.equal(store.state.audit.at(-1).action, 'plans.update');
});

test('trialDisableDoesNotRemoveExistingBenefitsAndManualGrantIsAudited', async () => {
  const store = makeStore();
  const handler = makeHandler(trialModule, store);
  const beforeCount = store.state.entitlements.length;
  const updateResponse = await handler(event({ method: 'POST', body: { action: 'update', enabled: false, photoLimit: 8, reason: 'controle hmlg' } }));
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(store.state.trial.enabled, false);
  assert.equal(store.state.entitlements.length, beforeCount);

  const grantResponse = await handler(event({ method: 'POST', body: { action: 'manual_grant', customerId: stateCustomerId(store), photoLimit: 8, reason: 'suporte' } }));
  assert.equal(grantResponse.statusCode, 200);
  assert.equal(store.state.entitlements.length, beforeCount + 1);
  assert.equal(store.state.audit.at(-1).action, 'trial.manual_grant');
});

test('paidOrderWithoutCreditReprocessesIdempotently', async () => {
  const store = makeStore();
  const handler = makeHandler(ordersModule, store);
  const first = await handler(event({ method: 'POST', body: { action: 'reprocess_entitlement', orderId: 'order-1', reason: 'pagamento aprovado sem credito' } }));
  assert.equal(first.statusCode, 200);
  assert.equal(parseBody(first).result.status, 'created');
  assert.equal(store.state.paymentCredits.length, 1);

  const second = await handler(event({ method: 'POST', body: { action: 'reprocess_entitlement', orderId: 'order-1', reason: 'segunda execucao' } }));
  assert.equal(second.statusCode, 200);
  assert.equal(parseBody(second).result.status, 'noop');
  assert.equal(store.state.paymentCredits.length, 1);
});

test('creditUsageGrantRecordsUsageUnitsWithoutFinancialBalance', async () => {
  const store = makeStore();
  const handler = makeHandler(creditsModule, store);
  const grant = await handler(event({ method: 'POST', body: { action: 'grant', customerId: stateCustomerId(store), creditTable: 'entitlements', usageUnits: 12, reason: 'ajuste suporte' } }));
  assert.equal(grant.statusCode, 200);
  assert.equal(parseBody(grant).credits.summary.photoUsage.effectiveLimitPerInspection, 12);
  assert.equal(store.state.adjustments.at(-1).previous_usage_units, 0);
  assert.equal(store.state.adjustments.at(-1).next_usage_units, 12);
  assert.equal(store.state.audit.at(-1).result, 'success');
});

test('inspectionsAreReadOnly', async () => {
  const store = makeStore();
  const getResponse = await makeHandler(inspectionsModule, store)(event());
  assert.equal(getResponse.statusCode, 200);
  assert.equal(parseBody(getResponse).inspections.length, 1);

  const postResponse = await makeHandler(inspectionsModule, store)(event({ method: 'POST', body: { action: 'mutate' } }));
  assert.equal(postResponse.statusCode, 405);
});

test('adminUsersRequireOwnerForMutation', async () => {
  const store = makeStore();
  const denied = await makeHandler(adminUsersModule, store, 'finance')(event({ method: 'POST', body: { action: 'create', email: 'finance@example.test', role: 'finance', reason: 'time financeiro' } }));
  assert.equal(denied.statusCode, 403);

  const created = await makeHandler(adminUsersModule, store, 'owner')(event({ method: 'POST', body: { action: 'create', email: 'support@example.test', role: 'support', reason: 'time suporte' } }));
  assert.equal(created.statusCode, 200);
  assert.equal(store.state.adminUsers.at(-1).role, 'support');
});

test('auditEndpointListsMutableActions', async () => {
  const store = makeStore();
  await makeHandler(customersModule, store)(event({ method: 'POST', body: { action: 'add_note', customerId: stateCustomerId(store), note: 'observacao', reason: 'atendimento' } }));
  const response = await makeHandler(auditModule, store)(event());
  assert.equal(response.statusCode, 200);
  assert.equal(parseBody(response).audit.length, 1);
  assert.equal(parseBody(response).audit[0].action, 'customers.note.create');
});

test('adminMigrationIsAdditiveAndHasRequiredTables', () => {
  const sql = fs.readFileSync('supabase/migrations/202607160900_admin_v1.sql', 'utf8').toLowerCase();
  for (const required of ['admin_users', 'admin_audit_log', 'admin_customer_notes', 'app_settings', 'admin_credit_adjustments']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${required}`));
  }
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b|\balter\s+column\b.*\bdrop\b/);
});

test('adminAuditUsesPendingAttemptsAndAtomicUsageCreditProcedure', () => {
  const storeSource = fs.readFileSync('netlify/functions/_admin/adminStore.mjs', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/202607160900_admin_v1.sql', 'utf8').toLowerCase();
  assert.match(storeSource, /result: 'pending'/);
  assert.match(storeSource, /result: 'success'/);
  assert.match(storeSource, /result: 'failed'/);
  assert.match(storeSource, /admin_adjust_usage_credit/);
  assert.match(migration, /create or replace function public\.admin_adjust_usage_credit/);
  assert.match(migration, /previous_usage_units/);
  assert.match(migration, /next_usage_units/);
  assert.match(migration, /admin_credit_adjustments/);
});

test('catalogPreservesSeededPlansAndCheckoutUsesOnlyEligibleDatabaseRows', () => {
  const catalogSeed = fs.readFileSync('supabase/migrations/202606290001_report_credits.sql', 'utf8');
  const paymentStoreSource = fs.readFileSync('netlify/functions/_paymentV1/paymentOrders.mjs', 'utf8');
  const paymentPlanSource = fs.readFileSync('netlify/functions/_paymentV1/paymentPlans.mjs', 'utf8');
  for (const [id, priceCents, photoLimit] of [
    ['report_50_beta_4990', '4990', '50'],
    ['report_100_9990', '9990', '100'],
    ['report_150_14990', '14990', '150'],
  ]) {
    assert.match(catalogSeed, new RegExp(`'${id}'[^\\n]*${priceCents}[^\\n]*${photoLimit}`));
  }
  assert.match(paymentStoreSource, /active=eq\.true&visible=eq\.true&available_for_purchase=eq\.true/);
  assert.match(paymentStoreSource, /plan_snapshot/);
  assert.doesNotMatch(paymentStoreSource, /plan\?\.value/);
  assert.doesNotMatch(paymentPlanSource, /4990|9990|14990/);
});

test('bootstrapAllowsOnlyConfiguredFirstOwnerAndThenUsesPersistedAdmin', async () => {
  assert.equal(getBootstrapOwnerEmail({ ADMIN_BOOTSTRAP_EMAILS: 'owner@example.test,second@example.test' }), 'owner@example.test');
  const authEvent = { headers: { authorization: 'Bearer bootstrap-token' } };
  const authFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ id: ownerAdmin.user_id, email: ownerAdmin.email }),
  });
  let bootstrapCalls = 0;
  const emptyRest = {
    select: async () => [],
    rpc: async (name) => {
      bootstrapCalls += 1;
      assert.equal(name, 'admin_bootstrap_owner');
      return { success: true, adminUser: ownerAdmin };
    },
  };
  const bootstrapped = await authenticateAdminRequest({
    event: authEvent,
    env: { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role', ADMIN_BOOTSTRAP_EMAILS: 'owner@example.test,second@example.test' },
    fetchImpl: authFetch,
    requiredPermission: 'dashboard.read',
    adminStore: { rest: emptyRest },
  });
  assert.equal(bootstrapped.admin.role, 'owner');
  assert.equal(bootstrapCalls, 1);

  const persistedRest = {
    select: async () => [ownerAdmin],
    rpc: async () => { throw new Error('bootstrap must not run for a persisted owner'); },
  };
  const persisted = await authenticateAdminRequest({
    event: authEvent,
    env: { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role' },
    fetchImpl: authFetch,
    requiredPermission: 'dashboard.read',
    adminStore: { rest: persistedRest },
  });
  assert.equal(persisted.admin.id, ownerAdmin.id);
});

test('adminRuntimeHasNoHardcodedAdminEmailOrCommercialCatalog', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf8');
  const paymentPlanSource = fs.readFileSync('netlify/functions/_paymentV1/paymentPlans.mjs', 'utf8');
  assert.doesNotMatch(appSource, /vistoriafacil\.ia@gmail\.com/i);
  assert.doesNotMatch(paymentPlanSource, /49\.9|99\.9|149\.9|4990|9990|14990/);
});

const stateCustomerId = (store) => store.state.customers[0].id;

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
