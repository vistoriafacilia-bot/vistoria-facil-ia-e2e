import { createAdminHandler } from './_admin/adminHttp.mjs';

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET'],
  permission: 'audit.read',
  ...options,
  handle: async ({ query, store }) => ({
    audit: await store.listAudit({
      entityType: query.entityType,
      entityId: query.entityId,
      limit: query.limit,
    }),
  }),
});

export const handler = (event = {}) => createHandler()(event);
