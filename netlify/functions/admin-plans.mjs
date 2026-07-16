import { AdminError } from './_admin/adminErrors.mjs';
import { createAdminHandler } from './_admin/adminHttp.mjs';

const permissionFor = (event = {}) => ((event.httpMethod || 'GET') === 'GET' ? 'plans.read' : 'plans.write');

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET', 'POST'],
  permission: permissionFor,
  ...options,
  handle: async ({ method, body, store, auth }) => {
    if (method === 'GET') return { plans: await store.listPlans() };

    const action = String(body.action || '').trim();
    if (action === 'create') {
      return {
        plan: await store.createPlan({
          body,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    if (action === 'update') {
      return {
        plan: await store.updatePlan({
          planId: body.planId,
          body,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    throw new AdminError('Invalid plan admin action.', {
      debugCode: 'admin_invalid_plan_action',
      statusCode: 400,
    });
  },
});

export const handler = (event = {}) => createHandler()(event);
