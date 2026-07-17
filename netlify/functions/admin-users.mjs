import { AdminError } from './_admin/adminErrors.mjs';
import { createAdminHandler } from './_admin/adminHttp.mjs';

const permissionFor = (event = {}) => ((event.httpMethod || 'GET') === 'GET' ? 'admin_users.read' : 'admin_users.write');

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET', 'POST'],
  permission: permissionFor,
  ...options,
  handle: async ({ method, body, store, auth }) => {
    if (method === 'GET') return { adminUsers: await store.listAdminUsers() };

    const action = String(body.action || '').trim();
    if (action === 'create') {
      return {
        adminUser: await store.createAdminUser({
          body,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    if (action === 'update') {
      return {
        adminUser: await store.updateAdminUser({
          adminUserId: body.adminUserId,
          body,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    throw new AdminError('Invalid admin user action.', {
      debugCode: 'admin_invalid_admin_user_action',
      statusCode: 400,
    });
  },
});

export const handler = (event = {}) => createHandler()(event);
