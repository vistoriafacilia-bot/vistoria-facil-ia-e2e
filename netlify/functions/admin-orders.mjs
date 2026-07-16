import { getAsaasPaymentConfirmation } from './_paymentV1/asaasClient.mjs';
import { AdminError } from './_admin/adminErrors.mjs';
import { createAdminHandler } from './_admin/adminHttp.mjs';

const permissionFor = (event = {}) => ((event.httpMethod || 'GET') === 'GET' ? 'orders.read' : 'orders.reprocess');

export const createHandler = ({ asaasClient = { getAsaasPaymentConfirmation }, ...options } = {}) => createAdminHandler({
  allowedMethods: ['GET', 'POST'],
  permission: permissionFor,
  ...options,
  handle: async ({ method, body, query, store, auth }) => {
    if (method === 'GET') {
      if (query.id) return { order: await store.getOrderBundle(query.id) };
      return { orders: await store.listOrders({ status: query.status, limit: query.limit }) };
    }

    const action = String(body.action || '').trim();
    if (action === 'reprocess_entitlement') {
      return {
        result: await store.reprocessOrderEntitlement({
          orderId: body.orderId,
          reason: body.reason,
          admin: auth.admin,
          authUser: auth.authUser,
        }),
      };
    }
    if (action === 'asaas_status') {
      const bundle = await store.getOrderBundle(body.orderId);
      return {
        asaasStatus: await asaasClient.getAsaasPaymentConfirmation({
          checkoutId: bundle.order.provider_checkout_id,
          externalReference: bundle.order.external_reference,
        }),
      };
    }
    throw new AdminError('Invalid order admin action.', {
      debugCode: 'admin_invalid_order_action',
      statusCode: 400,
    });
  },
});

export const handler = (event = {}) => createHandler()(event);
