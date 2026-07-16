import { AdminError } from './_admin/adminErrors.mjs';
import { createAdminHandler } from './_admin/adminHttp.mjs';

const permissionFor = (event = {}) => ((event.httpMethod || 'GET') === 'GET' ? 'trial.read' : 'trial.write');

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET', 'POST'],
  permission: permissionFor,
  ...options,
  handle: async ({ method, body, store, auth }) => {
    if (method === 'GET') return { trial: await store.getTrialSettings() };

    const action = String(body.action || '').trim();
    if (action === 'update') {
      return {
        trial: await store.updateTrialSettings({
          enabled: body.enabled,
          photoLimit: body.photoLimit,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    if (action === 'manual_grant') {
      return {
        entitlement: await store.grantTrial({
          customerId: body.customerId,
          photoLimit: body.photoLimit,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    throw new AdminError('Invalid trial admin action.', {
      debugCode: 'admin_invalid_trial_action',
      statusCode: 400,
    });
  },
});

export const handler = (event = {}) => createHandler()(event);
