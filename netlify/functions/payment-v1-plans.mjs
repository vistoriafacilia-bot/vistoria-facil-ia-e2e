import crypto from 'node:crypto';
import { createAdminStore } from './_admin/adminStore.mjs';
import { errorResponseBody, json, toAdminError } from './_admin/adminErrors.mjs';

export const createHandler = ({ storeFactory = createAdminStore, env = process.env } = {}) => async (event = {}) => {
  const requestId = crypto.randomUUID();
  try {
    if (event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, {
        error: 'Method not allowed.',
        debugCode: 'payment_v1_plans_method_not_allowed',
        requestId,
      });
    }
    const store = storeFactory({ env });
    return json(200, {
      plans: await store.listPublicPaymentPlans(),
      requestId,
    });
  } catch (error) {
    const adminError = toAdminError(error, 'payment_v1_plans_failed');
    return json(adminError.statusCode || 500, errorResponseBody(adminError, requestId));
  }
};

export const handler = (event = {}) => createHandler()(event);
