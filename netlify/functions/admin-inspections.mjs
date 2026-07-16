import { createAdminHandler } from './_admin/adminHttp.mjs';

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET'],
  permission: 'inspections.read',
  ...options,
  handle: async ({ query, store }) => {
    if (query.id) return { inspection: await store.getInspection(query.id) };
    return { inspections: await store.listInspections({ customerId: query.customerId, limit: query.limit }) };
  },
});

export const handler = (event = {}) => createHandler()(event);
