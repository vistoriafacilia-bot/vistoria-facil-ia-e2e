import { createAdminHandler } from './_admin/adminHttp.mjs';

export const createHandler = (options = {}) => createAdminHandler({
  allowedMethods: ['GET'],
  permission: 'dashboard.read',
  ...options,
  handle: async ({ store }) => ({
    dashboard: await store.getDashboard(),
  }),
});

export const handler = (event = {}) => createHandler()(event);
