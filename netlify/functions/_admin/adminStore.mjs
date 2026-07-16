import crypto from 'node:crypto';
import { AdminError } from './adminErrors.mjs';
import { createAdminRestClient, encodeFilterValue } from './adminSupabase.mjs';

const nowIso = () => new Date().toISOString();

const toArray = (rows) => (Array.isArray(rows) ? rows : rows ? [rows] : []);
const firstRow = (rows) => toArray(rows)[0] || null;

const requireReason = (reason) => {
  const value = String(reason || '').trim();
  if (!value) {
    throw new AdminError('Mutation reason is required.', {
      debugCode: 'admin_reason_required',
      statusCode: 400,
    });
  }
  return value;
};

const parseJsonBody = (body) => {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    throw new AdminError('Invalid JSON body.', {
      debugCode: 'admin_invalid_json',
      statusCode: 400,
    });
  }
};

const toPositiveInt = (value, fieldName) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new AdminError(`${fieldName} must be a positive integer.`, {
      debugCode: 'admin_invalid_positive_integer',
      statusCode: 400,
    });
  }
  return number;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validateHttpsOrigin = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new AdminError('Configured origin must be an HTTPS URL.', {
      debugCode: 'admin_invalid_https_origin',
      statusCode: 400,
    });
  }
  let url;
  try {
    url = new URL(value.trim().replace(/\/+$/, ''));
  } catch {
    throw new AdminError('Configured origin must be an HTTPS URL.', {
      debugCode: 'admin_invalid_https_origin',
      statusCode: 400,
    });
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new AdminError('Configured origin must be an HTTPS origin.', {
      debugCode: 'admin_invalid_https_origin',
      statusCode: 400,
    });
  }
  return url.origin;
};

const mapPaymentPlan = (row) => ({
  id: row.id,
  code: row.payment_v1_plan_code,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  regularPriceCents: row.regular_price_cents ?? null,
  currency: row.currency || 'BRL',
  analysisLimit: row.analysis_limit,
  badge: row.badge,
  active: Boolean(row.active),
  visible: Boolean(row.visible),
  availableForPurchase: Boolean(row.available_for_purchase),
  version: Number(row.version || 1),
  validFrom: row.valid_from || null,
  validUntil: row.valid_until || null,
  archivedAt: row.archived_at || null,
});

const publicPaymentPlan = (row) => ({
  code: row.payment_v1_plan_code,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  currency: row.currency || 'BRL',
  analysisLimit: row.analysis_limit,
  badge: row.badge,
});

const asPaymentCheckoutPlan = (row) => ({
  code: row.payment_v1_plan_code,
  catalogId: row.id,
  name: row.name,
  description: row.description,
  priceCents: Number(row.price_cents),
  amountCents: Number(row.price_cents),
  currency: row.currency || 'BRL',
  analysisLimit: Number(row.analysis_limit),
  snapshot: {
    catalogId: row.id,
    code: row.payment_v1_plan_code,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    currency: row.currency || 'BRL',
    analysisLimit: row.analysis_limit,
    version: row.version || 1,
  },
});

export const createAdminStore = ({ env = process.env, fetchImpl = globalThis.fetch, rest = null } = {}) => {
  const client = rest || createAdminRestClient({ env, fetchImpl });

  const recordAudit = async ({
    admin,
    authUser,
    action,
    entityType,
    entityId = null,
    previousValue = null,
    nextValue = null,
    reason = null,
    result = 'pending',
    correlationId = crypto.randomUUID(),
  }) => {
    const rows = await client.insert('admin_audit_log', {
      admin_user_id: admin?.id || null,
      admin_auth_user_id: authUser?.userId || admin?.user_id || null,
      admin_email: admin?.email || authUser?.email || null,
      admin_role: admin?.role || null,
      action,
      entity_type: entityType,
      entity_id: entityId === null || entityId === undefined ? null : String(entityId),
      previous_value: previousValue,
      next_value: nextValue,
      reason,
      result,
      correlation_id: correlationId,
    });
    return firstRow(rows);
  };

  const finalizeAudit = async ({ auditId, result, nextValue = undefined, failureCode = null }) => {
    if (!auditId) {
      throw new AdminError('Administrative audit attempt was not recorded.', {
        debugCode: 'admin_audit_attempt_missing',
        statusCode: 500,
      });
    }
    const patch = {
      result,
      completed_at: nowIso(),
      failure_code: failureCode,
    };
    if (nextValue !== undefined) patch.next_value = nextValue;
    return firstRow(await client.patch('admin_audit_log', `id=eq.${encodeFilterValue(auditId)}&select=*`, patch));
  };

  const errorCode = (error) => String(error?.debugCode || error?.code || 'admin_mutation_failed').slice(0, 120);

  const executeAuditedMutation = async ({ audit, mutate, nextValue = (value) => value }) => {
    const attempt = await recordAudit({ ...audit, result: 'pending' });
    let mutationCompleted = false;
    try {
      const value = await mutate();
      mutationCompleted = true;
      await finalizeAudit({
        auditId: attempt.id,
        result: 'success',
        nextValue: nextValue(value),
      });
      return value;
    } catch (error) {
      if (!mutationCompleted) {
        try {
          await finalizeAudit({
            auditId: attempt.id,
            result: 'failed',
            failureCode: errorCode(error),
          });
        } catch (auditError) {
          throw new AdminError('Administrative action failed and its audit could not be finalized.', {
            debugCode: 'admin_audit_finalize_failed',
            statusCode: 500,
            details: { mutation: errorCode(error), audit: errorCode(auditError) },
          });
        }
      }
      throw error;
    }
  };

  const countRows = async (table, filter = '') => {
    const query = `${filter ? `${filter}&` : ''}select=id&limit=1000`;
    return toArray(await client.select(table, query)).length;
  };

  const listPublicPaymentPlans = async () => {
    const rows = await client.select(
      'report_credit_plans',
      'payment_v1_plan_code=not.is.null&active=eq.true&visible=eq.true&available_for_purchase=eq.true&order=price_cents.asc&select=id,payment_v1_plan_code,name,description,price_cents,currency,analysis_limit,badge',
    );
    return toArray(rows).map(publicPaymentPlan);
  };

  const getPaymentV1PlanByCode = async (planCode) => {
    const rows = await client.select(
      'report_credit_plans',
      `payment_v1_plan_code=eq.${encodeFilterValue(planCode)}&active=eq.true&visible=eq.true&available_for_purchase=eq.true&limit=1&select=*`,
    );
    const row = firstRow(rows);
    return row ? asPaymentCheckoutPlan(row) : null;
  };

  const getDashboard = async () => {
    const [
      customers,
      orders,
      paidOrders,
      credits,
      inspections,
      failedOrders,
      failedPhotos,
      recentAudit,
    ] = await Promise.all([
      countRows('profiles'),
      countRows('payment_v1_orders'),
      countRows('payment_v1_orders', 'status=eq.paid'),
      countRows('payment_v1_credits'),
      countRows('inspections'),
      client.select('payment_v1_orders', 'status=in.(failed,refused)&order=updated_at.desc&limit=10&select=id,user_id,status,external_reference,updated_at'),
      client.select('photos', 'analysis_status=eq.failed&order=updated_at.desc&limit=10&select=id,user_id,inspection_id,analysis_error,updated_at'),
      client.select('admin_audit_log', 'result=neq.success&order=created_at.desc&limit=10&select=id,action,entity_type,entity_id,result,reason,created_at'),
    ]);

    return {
      metrics: {
        customers,
        orders,
        payments: paidOrders,
        credits,
        inspections,
      },
      recentFailures: [
        ...toArray(failedOrders).map((item) => ({ type: 'payment', ...item })),
        ...toArray(failedPhotos).map((item) => ({ type: 'ai_photo', ...item })),
        ...toArray(recentAudit).map((item) => ({ type: 'admin_audit', ...item })),
      ].slice(0, 20),
    };
  };

  const listCustomers = async ({ search = '', limit = 50 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const term = String(search || '').trim();
    const searchQuery = term
      ? `or=(email.ilike.*${encodeFilterValue(term)}*,name.ilike.*${encodeFilterValue(term)}*)&`
      : '';
    const rows = await client.select(
      'profiles',
      `${searchQuery}order=last_login_at.desc&limit=${safeLimit}&select=id,name,email,plan,created_at,last_login_at,admin_status,blocked_at,blocked_reason,deactivated_at,deactivation_reason`,
    );
    return toArray(rows);
  };

  const getCustomer = async (customerId) => {
    const encodedId = encodeFilterValue(customerId);
    const [
      profile,
      entitlements,
      orders,
      paymentCredits,
      reportCredits,
      inspections,
      notes,
      adjustments,
    ] = await Promise.all([
      client.select('profiles', `id=eq.${encodedId}&limit=1&select=*`),
      client.select('entitlements', `user_id=eq.${encodedId}&order=created_at.desc&limit=50&select=*`),
      client.select('payment_v1_orders', `user_id=eq.${encodedId}&order=created_at.desc&limit=50&select=*`),
      client.select('payment_v1_credits', `user_id=eq.${encodedId}&order=created_at.desc&limit=50&select=*`),
      client.select('report_credits', `user_id=eq.${encodedId}&order=created_at.desc&limit=50&select=*`),
      client.select('inspections', `user_id=eq.${encodedId}&order=started_at.desc&limit=50&select=*`),
      client.select('admin_customer_notes', `customer_id=eq.${encodedId}&active=eq.true&order=created_at.desc&limit=50&select=*`),
      client.select('admin_credit_adjustments', `customer_id=eq.${encodedId}&order=created_at.desc&limit=50&select=*`),
    ]);
    const customer = firstRow(profile);
    if (!customer) {
      throw new AdminError('Customer not found.', {
        debugCode: 'admin_customer_not_found',
        statusCode: 404,
      });
    }
    return {
      customer,
      entitlements: toArray(entitlements),
      orders: toArray(orders),
      paymentCredits: toArray(paymentCredits),
      reportCredits: toArray(reportCredits),
      inspections: toArray(inspections),
      notes: toArray(notes),
      adjustments: toArray(adjustments),
    };
  };

  const updateCustomerStatus = async ({ customerId, status, reason, admin, authUser }) => {
    const normalizedStatus = String(status || '').trim();
    if (!['active', 'blocked', 'deactivated'].includes(normalizedStatus)) {
      throw new AdminError('Invalid customer status.', {
        debugCode: 'admin_invalid_customer_status',
        statusCode: 400,
      });
    }
    const auditReason = requireReason(reason);
    const previous = (await getCustomer(customerId)).customer;
    const patch = {
      admin_status: normalizedStatus,
      admin_updated_at: nowIso(),
      admin_updated_by: admin?.id || null,
    };
    if (normalizedStatus === 'blocked') {
      patch.blocked_at = nowIso();
      patch.blocked_reason = auditReason;
    }
    if (normalizedStatus === 'active') {
      patch.blocked_at = null;
      patch.blocked_reason = null;
      patch.deactivated_at = null;
      patch.deactivation_reason = null;
    }
    if (normalizedStatus === 'deactivated') {
      patch.deactivated_at = nowIso();
      patch.deactivation_reason = auditReason;
    }
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: `customers.${normalizedStatus}`,
        entityType: 'profiles',
        entityId: customerId,
        previousValue: previous,
        nextValue: { ...previous, ...patch },
        reason: auditReason,
      },
      mutate: async () => firstRow(await client.patch('profiles', `id=eq.${encodeFilterValue(customerId)}&select=*`, patch)),
    });
  };

  const addCustomerNote = async ({ customerId, note, reason, admin, authUser }) => {
    const noteText = String(note || '').trim();
    if (!noteText) {
      throw new AdminError('Customer note is required.', {
        debugCode: 'admin_note_required',
        statusCode: 400,
      });
    }
    const auditReason = requireReason(reason);
    const nextValue = {
      customer_id: customerId,
      note: noteText,
      active: true,
      created_by: admin?.id || null,
      updated_by: admin?.id || null,
    };
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'customers.note.create',
        entityType: 'admin_customer_notes',
        entityId: customerId,
        previousValue: null,
        nextValue,
        reason: auditReason,
      },
      mutate: async () => firstRow(await client.insert('admin_customer_notes', nextValue)),
    });
  };

  const getPasswordResetRedirectOrigin = async () => {
    const rows = await client.select('app_settings', 'key=eq.admin.password_reset_redirect_origin&active=eq.true&limit=1&select=value');
    const value = firstRow(rows)?.value ?? null;
    return validateHttpsOrigin(value);
  };

  const sendPasswordReset = async ({ email, customerId, reason, admin, authUser }) => {
    const customerEmail = normalizeEmail(email);
    if (!customerEmail) {
      throw new AdminError('Customer email is required.', {
        debugCode: 'admin_customer_email_required',
        statusCode: 400,
      });
    }
    const auditReason = requireReason(reason);
    const redirectOrigin = await getPasswordResetRedirectOrigin();
    const body = {
      type: 'recovery',
      email: customerEmail,
    };
    if (redirectOrigin) body.options = { redirect_to: redirectOrigin };

    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'customers.password_reset.send',
        entityType: 'auth.users',
        entityId: customerId || customerEmail,
        previousValue: null,
        nextValue: { email: customerEmail, redirectOrigin: redirectOrigin ? '[configured]' : null },
        reason: auditReason,
      },
      mutate: async () => {
        const response = await fetchImpl(`${client.config.url}/auth/v1/admin/generate_link`, {
          method: 'POST',
          headers: {
            apikey: client.config.serviceRoleKey,
            authorization: `Bearer ${client.config.serviceRoleKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new AdminError('Password reset link could not be generated.', {
            debugCode: 'admin_password_reset_failed',
            statusCode: response.status >= 400 && response.status < 500 ? 400 : 502,
            details: responseBody,
          });
        }
        return { sent: true, email: customerEmail };
      },
    });
  };

  const listPlans = async () => {
    const rows = await client.select('report_credit_plans', 'order=created_at.asc&select=*');
    return toArray(rows).map(mapPaymentPlan);
  };

  const createPlan = async ({ body, admin, authUser }) => {
    const reason = requireReason(body.reason);
    const plan = {
      id: String(body.id || '').trim(),
      payment_v1_plan_code: String(body.code || '').trim() || null,
      name: String(body.name || '').trim(),
      description: String(body.description || '').trim(),
      price_cents: toPositiveInt(body.priceCents, 'priceCents'),
      regular_price_cents: body.regularPriceCents === null || body.regularPriceCents === undefined ? null : toPositiveInt(body.regularPriceCents, 'regularPriceCents'),
      currency: String(body.currency || 'BRL').trim().toUpperCase(),
      analysis_limit: toPositiveInt(body.analysisLimit, 'analysisLimit'),
      badge: String(body.badge || '').trim(),
      active: body.active !== false,
      visible: body.visible !== false,
      available_for_purchase: body.availableForPurchase !== false,
      version: 1,
      created_by_admin: admin?.id || null,
      updated_by_admin: admin?.id || null,
    };
    if (!plan.id || !plan.name || !plan.description || !plan.badge) {
      throw new AdminError('Plan id, name, description and badge are required.', {
        debugCode: 'admin_plan_required_fields',
        statusCode: 400,
      });
    }
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'plans.create',
        entityType: 'report_credit_plans',
        entityId: plan.id,
        previousValue: null,
        nextValue: plan,
        reason,
      },
      mutate: async () => firstRow(await client.insert('report_credit_plans', plan)),
    });
  };

  const updatePlan = async ({ planId, body, admin, authUser }) => {
    const reason = requireReason(body.reason);
    const previous = firstRow(await client.select('report_credit_plans', `id=eq.${encodeFilterValue(planId)}&limit=1&select=*`));
    if (!previous) {
      throw new AdminError('Plan not found.', {
        debugCode: 'admin_plan_not_found',
        statusCode: 404,
      });
    }
    const patch = {
      updated_by_admin: admin?.id || null,
      updated_at: nowIso(),
      version: Number(previous.version || 1) + 1,
    };
    if ('code' in body) patch.payment_v1_plan_code = String(body.code || '').trim() || null;
    if ('name' in body) patch.name = String(body.name || '').trim();
    if ('description' in body) patch.description = String(body.description || '').trim();
    if ('priceCents' in body) patch.price_cents = toPositiveInt(body.priceCents, 'priceCents');
    if ('regularPriceCents' in body) patch.regular_price_cents = body.regularPriceCents === null ? null : toPositiveInt(body.regularPriceCents, 'regularPriceCents');
    if ('currency' in body) patch.currency = String(body.currency || 'BRL').trim().toUpperCase();
    if ('analysisLimit' in body) patch.analysis_limit = toPositiveInt(body.analysisLimit, 'analysisLimit');
    if ('badge' in body) patch.badge = String(body.badge || '').trim();
    if ('active' in body) patch.active = Boolean(body.active);
    if ('visible' in body) patch.visible = Boolean(body.visible);
    if ('availableForPurchase' in body) patch.available_for_purchase = Boolean(body.availableForPurchase);
    if ('archived' in body) patch.archived_at = body.archived ? nowIso() : null;

    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'plans.update',
        entityType: 'report_credit_plans',
        entityId: planId,
        previousValue: previous,
        nextValue: { ...previous, ...patch },
        reason,
      },
      mutate: async () => firstRow(await client.patch('report_credit_plans', `id=eq.${encodeFilterValue(planId)}&select=*`, patch)),
    });
  };

  const getTrialSettings = async () => {
    const rows = await client.select('app_settings', 'key=in.(trial.enabled,trial.photo_limit)&order=key.asc&select=*');
    const map = Object.fromEntries(toArray(rows).map((row) => [row.key, row]));
    return {
      enabled: Boolean(map['trial.enabled']?.value),
      photoLimit: Number(map['trial.photo_limit']?.value || 0),
      raw: map,
    };
  };

  const updateTrialSettings = async ({ enabled, photoLimit, reason, admin, authUser }) => {
    const auditReason = requireReason(reason);
    const previous = await getTrialSettings();
    const patches = [];
    if (enabled !== undefined) {
      patches.push(client.patch('app_settings', 'key=eq.trial.enabled&select=*', {
        value: Boolean(enabled),
        updated_by: admin?.id || null,
      }));
    }
    if (photoLimit !== undefined) {
      patches.push(client.patch('app_settings', 'key=eq.trial.photo_limit&select=*', {
        value: toPositiveInt(photoLimit, 'photoLimit'),
        updated_by: admin?.id || null,
      }));
    }
    const nextValue = {
      enabled: enabled === undefined ? previous.enabled : Boolean(enabled),
      photoLimit: photoLimit === undefined ? previous.photoLimit : toPositiveInt(photoLimit, 'photoLimit'),
    };
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'trial.update',
        entityType: 'app_settings',
        entityId: 'trial',
        previousValue: previous,
        nextValue,
        reason: auditReason,
      },
      mutate: async () => {
        await Promise.all(patches);
        return getTrialSettings();
      },
    });
  };

  const grantTrial = async ({ customerId, photoLimit, reason, admin, authUser }) => {
    const auditReason = requireReason(reason);
    const limit = toPositiveInt(photoLimit, 'photoLimit');
    const entitlement = {
      id: `admin-trial-${crypto.randomUUID()}`,
      user_id: customerId,
      plan_id: 'free_10',
      status: 'active',
      source: 'manual_admin',
      max_photos_per_inspection: limit,
      pdf_enabled: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const previous = await getCustomer(customerId);
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'trial.manual_grant',
        entityType: 'entitlements',
        entityId: customerId,
        previousValue: { entitlements: previous.entitlements },
        nextValue: entitlement,
        reason: auditReason,
      },
      mutate: async () => firstRow(await client.insert('entitlements', entitlement)),
    });
  };

  const listOrders = async ({ status = '', limit = 100 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const filter = status ? `status=eq.${encodeFilterValue(status)}&` : '';
    const rows = await client.select('payment_v1_orders', `${filter}order=created_at.desc&limit=${safeLimit}&select=*`);
    return toArray(rows);
  };

  const getOrderBundle = async (orderId) => {
    const encodedId = encodeFilterValue(orderId);
    const [orders, credits, events] = await Promise.all([
      client.select('payment_v1_orders', `id=eq.${encodedId}&limit=1&select=*`),
      client.select('payment_v1_credits', `order_id=eq.${encodedId}&limit=10&select=*`),
      client.select('payment_v1_events', `order=created_at.desc&limit=50&select=*`),
    ]);
    const order = firstRow(orders);
    if (!order) {
      throw new AdminError('Order not found.', {
        debugCode: 'admin_order_not_found',
        statusCode: 404,
      });
    }
    const orderEvents = toArray(events).filter((event) => (
      event.external_reference === order.external_reference
      || event.provider_checkout_id === order.provider_checkout_id
    ));
    return {
      order,
      credits: toArray(credits),
      events: orderEvents,
      approvedWithoutCredit: order.status === 'paid' && toArray(credits).length === 0,
    };
  };

  const reprocessOrderEntitlement = async ({ orderId, reason, admin, authUser }) => {
    const auditReason = requireReason(reason);
    const previous = await getOrderBundle(orderId);
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'orders.entitlement.reprocess',
        entityType: 'payment_v1_orders',
        entityId: orderId,
        previousValue: previous,
        nextValue: null,
        reason: auditReason,
      },
      mutate: async () => {
        let result = { status: 'noop', credit: previous.credits[0] || null };
        if (previous.order.status === 'paid' && previous.credits.length === 0) {
          const credit = {
            user_id: previous.order.user_id,
            order_id: previous.order.id,
            plan_code: previous.order.plan_code,
            analysis_limit: previous.order.analysis_limit,
            analysis_used: 0,
            status: 'active',
          };
          result = {
            status: 'created',
            credit: firstRow(await client.insert('payment_v1_credits', credit)),
          };
        }
        await client.patch('payment_v1_orders', `id=eq.${encodeFilterValue(orderId)}&select=*`, {
          admin_last_reprocessed_at: nowIso(),
          admin_last_reprocess_result: result,
          admin_reprocess_count: Number(previous.order.admin_reprocess_count || 0) + 1,
        });
        return result;
      },
    });
  };

  const getCreditSummary = async (customerId = '') => {
    const filter = customerId ? `user_id=eq.${encodeFilterValue(customerId)}&` : '';
    const [paymentCredits, reportCredits, entitlements] = await Promise.all([
      client.select('payment_v1_credits', `${filter}order=created_at.desc&limit=200&select=*`),
      client.select('report_credits', `${filter}order=created_at.desc&limit=200&select=*`),
      client.select('entitlements', `${filter}order=created_at.desc&limit=200&select=*`),
    ]);
    const activePaymentCredits = toArray(paymentCredits).filter((credit) => credit.status === 'active');
    const activeReportCredits = toArray(reportCredits).filter((credit) => ['available', 'assigned', 'in_progress'].includes(credit.status));
    const activeEntitlements = toArray(entitlements).filter((item) => item.status === 'active');
    return {
      customerId: customerId || null,
      photoUsage: {
        effectiveLimitPerInspection: Math.max(
          0,
          ...activePaymentCredits.map((credit) => Number(credit.analysis_limit || 0)),
          ...activeEntitlements.map((item) => Number(item.max_photos_per_inspection || 0)),
        ),
        paymentCredits: toArray(paymentCredits),
        manualPhotoLimits: toArray(entitlements).filter((item) => item.plan_id === 'admin_usage'),
      },
      reportUsage: {
        availableCredits: activeReportCredits.filter((credit) => credit.status === 'available').length,
        reportCredits: toArray(reportCredits),
      },
    };
  };

  const adjustCredits = async ({ customerId, action, usageUnits, creditTable, creditId, planId, reason, admin, authUser }) => {
    const normalizedAction = String(action || '').trim();
    if (!['grant', 'remove'].includes(normalizedAction)) {
      throw new AdminError('Invalid credit action.', {
        debugCode: 'admin_invalid_credit_action',
        statusCode: 400,
      });
    }
    const auditReason = requireReason(reason);
    if (!customerId || !creditTable) {
      throw new AdminError('Customer and usage credit type are required.', {
        debugCode: 'admin_credit_target_required',
        statusCode: 400,
      });
    }
    if (normalizedAction === 'remove' && !creditId) {
      throw new AdminError('Usage credit id is required for removal.', {
        debugCode: 'admin_credit_target_required',
        statusCode: 400,
      });
    }
    const safeUsageUnits = normalizedAction === 'grant'
      ? toPositiveInt(usageUnits, 'usageUnits')
      : Math.max(Number(usageUnits) || 1, 1);
    const result = await client.rpc('admin_adjust_usage_credit', {
      p_customer_id: customerId,
      p_action: normalizedAction,
      p_credit_table: creditTable,
      p_credit_id: creditId || null,
      p_plan_id: planId || null,
      p_usage_units: safeUsageUnits,
      p_reason: auditReason,
      p_admin_user_id: admin?.id || null,
      p_admin_auth_user_id: authUser?.userId || admin?.user_id || null,
      p_admin_email: admin?.email || authUser?.email || null,
      p_admin_role: admin?.role || null,
      p_correlation_id: crypto.randomUUID(),
    });
    const operation = Array.isArray(result) ? result[0] : result;
    if (!operation?.success) {
      throw new AdminError('Usage credit adjustment failed.', {
        debugCode: operation?.failureCode || 'admin_credit_adjustment_failed',
        statusCode: 400,
      });
    }
    return {
      adjustment: operation.adjustment,
      summary: await getCreditSummary(customerId),
    };
  };

  const listInspections = async ({ customerId = '', limit = 100 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const filter = customerId ? `user_id=eq.${encodeFilterValue(customerId)}&` : '';
    return toArray(await client.select('inspections', `${filter}order=started_at.desc&limit=${safeLimit}&select=*`));
  };

  const getInspection = async (inspectionId) => {
    const encodedId = encodeFilterValue(inspectionId);
    const [inspections, photos, reports, reportCredits] = await Promise.all([
      client.select('inspections', `id=eq.${encodedId}&limit=1&select=*`),
      client.select('photos', `inspection_id=eq.${encodedId}&order=created_at.asc&limit=500&select=id,inspection_id,room_id,user_id,caption,reviewed_status,upload_status,analysis_status,analysis_error,created_at,updated_at`),
      client.select('reports', `inspection_id=eq.${encodedId}&order=generated_at.desc&limit=20&select=*`),
      client.select('report_credits', `inspection_id=eq.${encodedId}&order=created_at.desc&limit=20&select=*`),
    ]);
    const inspection = firstRow(inspections);
    if (!inspection) {
      throw new AdminError('Inspection not found.', {
        debugCode: 'admin_inspection_not_found',
        statusCode: 404,
      });
    }
    return {
      inspection,
      photos: toArray(photos),
      reports: toArray(reports),
      reportCredits: toArray(reportCredits),
    };
  };

  const listAdminUsers = async () => toArray(await client.select('admin_users', 'order=created_at.asc&select=*'));

  const createAdminUser = async ({ body, admin, authUser }) => {
    const reason = requireReason(body.reason);
    const role = String(body.role || '').trim();
    const email = normalizeEmail(body.email);
    if (!email || !['owner', 'operation', 'support', 'finance', 'read_only'].includes(role)) {
      throw new AdminError('Admin email and valid role are required.', {
        debugCode: 'admin_user_required_fields',
        statusCode: 400,
      });
    }
    const nextValue = {
      user_id: body.userId || null,
      email,
      display_name: String(body.displayName || email).trim(),
      role,
      active: body.active !== false,
      created_by: admin?.id || null,
      updated_by: admin?.id || null,
    };
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'admin_users.create',
        entityType: 'admin_users',
        entityId: email,
        previousValue: null,
        nextValue,
        reason,
      },
      mutate: async () => firstRow(await client.insert('admin_users', nextValue)),
    });
  };

  const updateAdminUser = async ({ adminUserId, body, admin, authUser }) => {
    const reason = requireReason(body.reason);
    const previous = firstRow(await client.select('admin_users', `id=eq.${encodeFilterValue(adminUserId)}&limit=1&select=*`));
    if (!previous) {
      throw new AdminError('Admin user not found.', {
        debugCode: 'admin_user_not_found',
        statusCode: 404,
      });
    }
    const patch = {
      updated_by: admin?.id || null,
    };
    if ('role' in body) patch.role = String(body.role || '').trim();
    if ('active' in body) {
      patch.active = Boolean(body.active);
      patch.disabled_at = body.active ? null : nowIso();
    }
    if ('displayName' in body) patch.display_name = String(body.displayName || '').trim();
    return executeAuditedMutation({
      audit: {
        admin,
        authUser,
        action: 'admin_users.update',
        entityType: 'admin_users',
        entityId: adminUserId,
        previousValue: previous,
        nextValue: { ...previous, ...patch },
        reason,
      },
      mutate: async () => firstRow(await client.patch('admin_users', `id=eq.${encodeFilterValue(adminUserId)}&select=*`, patch)),
    });
  };

  const listAudit = async ({ entityType = '', entityId = '', limit = 100 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const filters = [];
    if (entityType) filters.push(`entity_type=eq.${encodeFilterValue(entityType)}`);
    if (entityId) filters.push(`entity_id=eq.${encodeFilterValue(entityId)}`);
    const prefix = filters.length ? `${filters.join('&')}&` : '';
    return toArray(await client.select('admin_audit_log', `${prefix}order=created_at.desc&limit=${safeLimit}&select=*`));
  };

  return {
    rest: client,
    parseJsonBody,
    recordAudit,
    listPublicPaymentPlans,
    getPaymentV1PlanByCode,
    getDashboard,
    listCustomers,
    getCustomer,
    updateCustomerStatus,
    addCustomerNote,
    sendPasswordReset,
    listPlans,
    createPlan,
    updatePlan,
    getTrialSettings,
    updateTrialSettings,
    grantTrial,
    listOrders,
    getOrderBundle,
    reprocessOrderEntitlement,
    getCreditSummary,
    adjustCredits,
    listInspections,
    getInspection,
    listAdminUsers,
    createAdminUser,
    updateAdminUser,
    listAudit,
  };
};
