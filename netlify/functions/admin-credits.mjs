import { AdminError } from './_admin/adminErrors.mjs';
import { createAdminHandler } from './_admin/adminHttp.mjs';

const permissionFor = (event = {}) => ((event.httpMethod || 'GET') === 'GET' ? 'credits.read' : 'credits.write');

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET', 'POST'],
  permission: permissionFor,
  ...options,
  handle: async ({ method, body, query, store, auth }) => {
    if (method === 'GET') {
      return {
        credits: await store.getCreditSummary(query.customerId || ''),
      };
    }

    const action = String(body.action || '').trim();
    if (action === 'grant' || action === 'remove') {
      return {
        credits: await store.adjustCredits({
          customerId: body.customerId,
          action,
          usageUnits: body.usageUnits,
          creditTable: body.creditTable,
          creditId: body.creditId,
          planId: body.planId,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    throw new AdminError('Invalid credit admin action.', {
      debugCode: 'admin_invalid_credit_action',
      statusCode: 400,
    });
  },
});

export const handler = (event = {}) => createHandler()(event);
