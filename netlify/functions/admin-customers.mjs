import { createAdminHandler } from './_admin/adminHttp.mjs';

const permissionFor = (event = {}) => {
  if ((event.httpMethod || 'GET') === 'GET') return 'customers.read';
  return 'customers.write';
};

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET', 'POST'],
  permission: permissionFor,
  ...options,
  handle: async ({ method, body, query, store, auth }) => {
    if (method === 'GET') {
      if (query.id) return { customer: await store.getCustomer(query.id) };
      return { customers: await store.listCustomers({ search: query.search, limit: query.limit }) };
    }

    const action = String(body.action || '').trim();
    if (action === 'set_status') {
      return {
        customer: await store.updateCustomerStatus({
          customerId: body.customerId,
          status: body.status,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    if (action === 'add_note') {
      return {
        note: await store.addCustomerNote({
          customerId: body.customerId,
          note: body.note,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    if (action === 'send_password_reset') {
      return {
        passwordReset: await store.sendPasswordReset({
          email: body.email,
          customerId: body.customerId,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    throw Object.assign(new Error('Invalid customer admin action.'), {
      debugCode: 'admin_invalid_customer_action',
      statusCode: 400,
    });
  },
});

export const handler = (event = {}) => createHandler()(event);
